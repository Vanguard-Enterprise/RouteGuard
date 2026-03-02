package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/repository"
	"github.com/routeguard/api/internal/stream"
)

// StreamTrips handles GET /dashboard/stream/trips.
// It subscribes to Redis pub/sub channels for all in-progress trips belonging
// to the authenticated org and forwards messages to the client as SSE events.
func (h *Handler) StreamTrips(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	ctx := r.Context()

	// Fetch all in-progress trips for this org.
	inProgress := "in_progress"
	tripRepo := repository.NewTripRepo(h.pool)
	trips, err := tripRepo.List(ctx, session.OrgID, 100, 0, &inProgress, nil)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to fetch active trips")
		return
	}

	// Build the list of Redis channels to subscribe to.
	channels := make([]string, 0, len(trips)*2+1)
	for _, t := range trips {
		channels = append(channels, "trip:location:"+t.ID)
		channels = append(channels, "trip:scan:"+t.ID)
	}
	channels = append(channels, "trip:alert:"+session.OrgID)

	// Subscribe to all channels.
	pubsub := h.cache.Subscribe(ctx, channels...)
	defer pubsub.Close()

	// Prepare the SSE writer; 503 if the ResponseWriter doesn't support flushing.
	sse, ok := stream.NewWriter(w)
	if !ok {
		Error(w, http.StatusServiceUnavailable, "streaming not supported")
		return
	}

	msgCh := pubsub.Channel()

	for {
		select {
		case msg, open := <-msgCh:
			if !open {
				return
			}

			// Determine SSE event name from the channel prefix.
			var eventName string
			switch {
			case strings.HasPrefix(msg.Channel, "trip:location:"):
				eventName = "location"
			case strings.HasPrefix(msg.Channel, "trip:scan:"):
				eventName = "scan"
			case strings.HasPrefix(msg.Channel, "trip:alert:"):
				eventName = "alert"
			default:
				continue
			}

			// Forward the pre-encoded JSON payload without double-encoding.
			_ = sse.Send(eventName, json.RawMessage(msg.Payload))

		case <-ctx.Done():
			return
		}
	}
}
