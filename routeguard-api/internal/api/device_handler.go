package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/middleware"
	"github.com/routeguard/api/internal/repository"
)

func (h *Handler) authenticateDeviceRequest(r *http.Request) (*repository.DeviceCheckInInput, error) {
	device, err := h.authenticateDevice(r)
	if err != nil {
		return nil, err
	}
	return &repository.DeviceCheckInInput{
		DeviceID: device.ID,
	}, nil
}

func (h *Handler) authenticateDevice(r *http.Request) (*domain.Device, error) {
	token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	if token == "" {
		return nil, http.ErrNoCookie
	}
	device, err := h.devices.AuthenticateByToken(r.Context(), crypto.HMAC(h.cfg.HMACKey, token))
	if err != nil {
		return nil, err
	}
	if device.OrgID == nil {
		return nil, http.ErrNoCookie
	}
	return device, nil
}

type deviceBootstrapRequest struct {
	DeviceID        string         `json:"device_id"`
	SoftwareVersion string         `json:"software_version"`
	Metadata        map[string]any `json:"metadata"`
}

func (h *Handler) DeviceBootstrap(w http.ResponseWriter, r *http.Request) {
	var body deviceBootstrapRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	body.DeviceID = strings.TrimSpace(body.DeviceID)
	body.SoftwareVersion = strings.TrimSpace(body.SoftwareVersion)
	if body.DeviceID == "" {
		Error(w, http.StatusBadRequest, "device_id is required")
		return
	}

	meta, _ := json.Marshal(body.Metadata)
	device, err := h.devices.UpsertBootstrap(r.Context(), body.DeviceID, body.SoftwareVersion, meta)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to bootstrap device")
		return
	}

	now := time.Now().UTC()
	if device.EnrolledAt != nil && device.RevokedAt == nil && device.OrgID != nil {
		JSON(w, http.StatusOK, map[string]any{
			"status":     "enrolled",
			"device_id":  device.DeviceKey,
			"org_id":     device.OrgID,
			"vehicle_id": device.VehicleID,
		})
		return
	}

	_, code, expires, err := h.devices.EnsureEnrollmentCode(r.Context(), body.DeviceID, h.cfg.HMACKey, now)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to issue enrollment code")
		return
	}

	JSON(w, http.StatusOK, map[string]any{
		"status":                "unenrolled",
		"device_id":             body.DeviceID,
		"enrollment_code":       code,
		"enrollment_expires_at": expires,
	})
}

func (h *Handler) DeviceEnrollmentCode(w http.ResponseWriter, r *http.Request) {
	var body struct {
		DeviceID string `json:"device_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	body.DeviceID = strings.TrimSpace(body.DeviceID)
	if body.DeviceID == "" {
		Error(w, http.StatusBadRequest, "device_id is required")
		return
	}

	_, code, expires, err := h.devices.EnsureEnrollmentCode(r.Context(), body.DeviceID, h.cfg.HMACKey, time.Now().UTC())
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to refresh enrollment code")
		return
	}
	JSON(w, http.StatusOK, map[string]any{
		"device_id":             body.DeviceID,
		"enrollment_code":       code,
		"enrollment_expires_at": expires,
	})
}

func (h *Handler) DeviceEnrollmentStatus(w http.ResponseWriter, r *http.Request) {
	var body struct {
		DeviceID string `json:"device_id"`
		Code     string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	body.DeviceID = strings.TrimSpace(body.DeviceID)
	body.Code = strings.TrimSpace(body.Code)
	if body.DeviceID == "" {
		Error(w, http.StatusBadRequest, "device_id is required")
		return
	}

	status, err := h.devices.EnrollmentStatus(r.Context(), body.DeviceID, body.Code, h.cfg.HMACKey, h.cfg.DataEncryptionKey, time.Now().UTC())
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load enrollment status")
		return
	}

	response := map[string]any{
		"status":     status.Status,
		"device_id":  body.DeviceID,
		"org_id":     status.Device.OrgID,
		"vehicle_id": status.Device.VehicleID,
	}
	if status.Token != "" {
		response["device_token"] = status.Token
	}
	if status.Expires != nil {
		response["enrollment_expires_at"] = *status.Expires
	}
	JSON(w, http.StatusOK, response)
}

type deviceCheckInRequest struct {
	Name              string         `json:"name"`
	SoftwareVersion   string         `json:"software_version"`
	ConnectivityState string         `json:"connectivity_state"`
	AppHealth         string         `json:"app_health"`
	LastSeenAt        *time.Time     `json:"last_seen_at"`
	Metadata          map[string]any `json:"metadata"`
}

func (h *Handler) DeviceCheckIn(w http.ResponseWriter, r *http.Request) {
	authn, err := h.authenticateDeviceRequest(r)
	if err != nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var body deviceCheckInRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	meta, _ := json.Marshal(body.Metadata)
	lastSeen := time.Now().UTC()
	if body.LastSeenAt != nil {
		lastSeen = body.LastSeenAt.UTC()
	}
	if strings.TrimSpace(body.ConnectivityState) == "" {
		body.ConnectivityState = "unknown"
	}
	if strings.TrimSpace(body.AppHealth) == "" {
		body.AppHealth = "unknown"
	}

	device, err := h.devices.UpdateHeartbeat(r.Context(), repository.DeviceCheckInInput{
		DeviceID:          authn.DeviceID,
		Name:              strings.TrimSpace(body.Name),
		SoftwareVersion:   strings.TrimSpace(body.SoftwareVersion),
		ConnectivityState: strings.TrimSpace(body.ConnectivityState),
		AppHealth:         strings.TrimSpace(body.AppHealth),
		LastSeenAt:        lastSeen,
		Metadata:          meta,
	})
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to record device check-in")
		return
	}

	latest, err := h.devices.LatestSoftwareRelease(r.Context())
	if err != nil && !isNotFound(err) {
		Error(w, http.StatusInternalServerError, "failed to load release metadata")
		return
	}
	JSON(w, http.StatusOK, map[string]any{
		"device":         device,
		"latest_release": latest,
	})
}

type riderScanItemRequest struct {
	EventUID   string         `json:"event_uid"`
	StudentTag string         `json:"student_tag"`
	ScannedAt  time.Time      `json:"scanned_at"`
	RouteID    *string        `json:"route_id"`
	Metadata   map[string]any `json:"metadata"`
}

type riderScanBatchRequest struct {
	Events []riderScanItemRequest `json:"events"`
}

func (h *Handler) DeviceRFIDEvents(w http.ResponseWriter, r *http.Request) {
	device, err := h.authenticateDevice(r)
	if err != nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var body riderScanBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(body.Events) == 0 {
		Error(w, http.StatusBadRequest, "events are required")
		return
	}

	type eventResult struct {
		EventUID string `json:"event_uid"`
		Status   string `json:"status"`
		ID       string `json:"id,omitempty"`
	}

	results := make([]eventResult, 0, len(body.Events))
	for _, item := range body.Events {
		item.EventUID = strings.TrimSpace(item.EventUID)
		item.StudentTag = strings.TrimSpace(item.StudentTag)
		if item.EventUID == "" || item.StudentTag == "" || item.ScannedAt.IsZero() {
			results = append(results, eventResult{EventUID: item.EventUID, Status: "rejected"})
			continue
		}
		if item.RouteID != nil && *item.RouteID != "" {
			if _, err := h.routes.GetByID(r.Context(), *device.OrgID, *item.RouteID); err != nil {
				results = append(results, eventResult{EventUID: item.EventUID, Status: "rejected"})
				continue
			}
		}
		meta, _ := json.Marshal(item.Metadata)
		event, err := h.devices.CreateScanEvent(r.Context(), repository.RiderScanInput{
			DeviceID:   device.ID,
			OrgID:      *device.OrgID,
			RouteID:    item.RouteID,
			EventUID:   item.EventUID,
			StudentTag: item.StudentTag,
			ScannedAt:  item.ScannedAt.UTC(),
			Metadata:   meta,
		})
		if err != nil {
			results = append(results, eventResult{EventUID: item.EventUID, Status: "rejected"})
			continue
		}
		results = append(results, eventResult{EventUID: item.EventUID, Status: "accepted", ID: event.ID})
	}

	JSON(w, http.StatusOK, map[string]any{"results": results})
}

func (h *Handler) DeviceDriverLogin(w http.ResponseWriter, r *http.Request) {
	device, err := h.authenticateDevice(r)
	if err != nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var body struct {
		PIN string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	body.PIN = strings.TrimSpace(body.PIN)
	if err := auth.ValidatePIN(body.PIN); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}

	driver, err := h.drivers.FindActiveByPINLookup(r.Context(), *device.OrgID, crypto.HMAC(h.cfg.HMACKey, body.PIN))
	if err != nil || driver.PinHash == nil {
		Error(w, http.StatusForbidden, "invalid driver pin")
		return
	}

	ok, err := auth.VerifyPIN(body.PIN, *driver.PinHash)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to verify driver pin")
		return
	}
	if !ok {
		Error(w, http.StatusForbidden, "invalid driver pin")
		return
	}

	JSON(w, http.StatusOK, domain.DeviceDriverLoginResponse{
		Driver: domain.DeviceDriverSummary{
			ID:       driver.ID,
			DriverID: driver.DriverID,
			Name:     driver.Name,
		},
	})
}

func (h *Handler) DeviceLatestRelease(w http.ResponseWriter, r *http.Request) {
	if _, err := h.authenticateDeviceRequest(r); err != nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	rel, err := h.devices.LatestSoftwareRelease(r.Context())
	if err != nil {
		if isNotFound(err) {
			JSON(w, http.StatusOK, map[string]any{"latest_release": nil})
			return
		}
		Error(w, http.StatusInternalServerError, "failed to load latest release")
		return
	}
	JSON(w, http.StatusOK, map[string]any{"latest_release": rel})
}

func (h *Handler) PlatformListSoftwareReleases(w http.ResponseWriter, r *http.Request) {
	items, err := h.devices.ListSoftwareReleases(r.Context())
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list releases")
		return
	}
	JSON(w, http.StatusOK, items)
}

func (h *Handler) PlatformCreateSoftwareRelease(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Version          string `json:"version"`
		ReleaseDate      string `json:"release_date"`
		ReleaseNotes     string `json:"release_notes"`
		ArtifactURL      string `json:"artifact_url"`
		ArtifactSHA256   string `json:"artifact_sha256"`
		InstallerURL     string `json:"installer_url"`
		TargetOS         string `json:"target_os"`
		TargetArch       string `json:"target_arch"`
		IsInstallDefault bool   `json:"is_install_default"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	body.Version = strings.TrimSpace(body.Version)
	body.ReleaseDate = strings.TrimSpace(body.ReleaseDate)
	body.ArtifactURL = strings.TrimSpace(body.ArtifactURL)
	body.ArtifactSHA256 = strings.TrimSpace(body.ArtifactSHA256)
	body.InstallerURL = strings.TrimSpace(body.InstallerURL)
	body.TargetOS = strings.TrimSpace(body.TargetOS)
	body.TargetArch = strings.TrimSpace(body.TargetArch)
	if body.Version == "" || body.ReleaseDate == "" || body.ArtifactURL == "" || body.ArtifactSHA256 == "" || body.InstallerURL == "" {
		Error(w, http.StatusBadRequest, "version, release_date, artifact_url, artifact_sha256, and installer_url are required")
		return
	}
	if body.TargetOS == "" {
		body.TargetOS = "debian"
	}
	if body.TargetArch == "" {
		body.TargetArch = "amd64"
	}
	if len(body.ArtifactSHA256) != 64 {
		Error(w, http.StatusBadRequest, "artifact_sha256 must be a 64 character hex digest")
		return
	}

	rel, err := h.devices.CreateSoftwareRelease(r.Context(), repository.SoftwareReleaseCreateInput{
		Version:          body.Version,
		ReleaseDate:      body.ReleaseDate,
		ReleaseNotes:     body.ReleaseNotes,
		ArtifactURL:      body.ArtifactURL,
		ArtifactSHA256:   strings.ToLower(body.ArtifactSHA256),
		InstallerURL:     body.InstallerURL,
		TargetOS:         body.TargetOS,
		TargetArch:       body.TargetArch,
		IsInstallDefault: body.IsInstallDefault,
	})
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "version already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to create release")
		return
	}
	JSON(w, http.StatusCreated, rel)
}

func (h *Handler) PlatformGetInstallCommand(w http.ResponseWriter, r *http.Request) {
	rel, err := h.devices.InstallDefaultSoftwareRelease(r.Context())
	if err != nil {
		if isNotFound(err) {
			rel, err = h.devices.LatestSoftwareRelease(r.Context())
		}
		if err != nil {
			Error(w, http.StatusNotFound, "no installable device release available")
			return
		}
	}
	if strings.TrimSpace(rel.InstallerURL) == "" || strings.TrimSpace(rel.ArtifactURL) == "" || strings.TrimSpace(rel.ArtifactSHA256) == "" {
		Error(w, http.StatusNotFound, "selected release does not have install metadata")
		return
	}

	command := fmt.Sprintf(
		"curl -fsSL %s | sudo bash -s -- --package-url %s --sha256 %s --version %s",
		shellEscape(rel.InstallerURL),
		shellEscape(rel.ArtifactURL),
		shellEscape(rel.ArtifactSHA256),
		shellEscape(rel.Version),
	)

	JSON(w, http.StatusOK, domain.DeviceInstallCommand{
		Release: rel,
		Command: command,
	})
}

func (h *Handler) PlatformGetRollout(w http.ResponseWriter, r *http.Request) {
	summary, err := h.devices.RolloutSummary(r.Context())
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load rollout")
		return
	}
	for i := range summary.Organizations {
		summary.Organizations[i].OrgName = h.decryptOrgNameFromEncrypted(summary.Organizations[i].OrgName)
		for j := range summary.Organizations[i].Devices {
			summary.Organizations[i].Devices[j].OrgName = summary.Organizations[i].OrgName
		}
	}
	JSON(w, http.StatusOK, summary)
}

func shellEscape(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func (h *Handler) decryptOrgNameFromEncrypted(nameEnc string) string {
	if nameEnc == "" {
		return ""
	}
	name, err := crypto.Decrypt(h.cfg.DataEncryptionKey, nameEnc)
	if err != nil {
		return nameEnc
	}
	return name
}

func (h *Handler) OrgListDevices(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	items, err := h.devices.ListByOrg(r.Context(), session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list devices")
		return
	}
	JSON(w, http.StatusOK, items)
}

func (h *Handler) OrgClaimDevice(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	var body struct {
		EnrollmentCode string  `json:"enrollment_code"`
		VehicleID      *string `json:"vehicle_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	body.EnrollmentCode = strings.TrimSpace(body.EnrollmentCode)
	if body.EnrollmentCode == "" {
		Error(w, http.StatusBadRequest, "enrollment_code is required")
		return
	}
	if body.VehicleID != nil && *body.VehicleID != "" {
		if _, err := h.vehicles.GetByID(r.Context(), session.OrgID, *body.VehicleID); err != nil {
			if isNotFound(err) {
				Error(w, http.StatusBadRequest, "vehicle not found")
				return
			}
			Error(w, http.StatusInternalServerError, "failed to validate vehicle")
			return
		}
	}
	device, err := h.devices.ClaimByEnrollmentCode(r.Context(), repository.DeviceClaimInput{
		OrgID:     session.OrgID,
		Code:      body.EnrollmentCode,
		VehicleID: body.VehicleID,
		HMACKey:   h.cfg.HMACKey,
		CryptoKey: h.cfg.DataEncryptionKey,
		ClaimedAt: time.Now().UTC(),
	})
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "enrollment code not found or expired")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to claim device")
		return
	}
	JSON(w, http.StatusOK, device)
}

func (h *Handler) OrgUpdateDevice(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	id := chi.URLParam(r, "id")
	var body struct {
		VehicleID *string `json:"vehicle_id"`
		Name      string  `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.VehicleID != nil && *body.VehicleID != "" {
		if _, err := h.vehicles.GetByID(r.Context(), session.OrgID, *body.VehicleID); err != nil {
			if isNotFound(err) {
				Error(w, http.StatusBadRequest, "vehicle not found")
				return
			}
			Error(w, http.StatusInternalServerError, "failed to validate vehicle")
			return
		}
	}
	device, err := h.devices.UpdateAssignment(r.Context(), session.OrgID, id, body.VehicleID, strings.TrimSpace(body.Name))
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "device not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to update device")
		return
	}
	JSON(w, http.StatusOK, device)
}

func (h *Handler) OrgResetDevice(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	id := chi.URLParam(r, "id")
	device, err := h.devices.ResetEnrollment(r.Context(), session.OrgID, id, time.Now().UTC())
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "device not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to reset device")
		return
	}
	JSON(w, http.StatusOK, device)
}
