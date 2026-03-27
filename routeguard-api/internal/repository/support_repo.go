package repository

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type SupportRepo struct {
	pool *pgxpool.Pool
}

func NewSupportRepo(pool *pgxpool.Pool) *SupportRepo {
	return &SupportRepo{pool: pool}
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanSupportTicket(row rowScanner, t *domain.SupportTicket) error {
	return row.Scan(
		&t.ID,
		&t.OrgID,
		&t.CreatedByUserID,
		&t.AssignedAdminUserID,
		&t.Subject,
		&t.Status,
		&t.CreatedAt,
		&t.UpdatedAt,
		&t.LastMessageAt,
		&t.ResolvedAt,
	)
}

func scanSupportMessage(row rowScanner, m *domain.SupportMessage) error {
	return row.Scan(
		&m.ID,
		&m.TicketID,
		&m.SenderUserID,
		&m.SenderOrgID,
		&m.SenderIsPlatform,
		&m.Body,
		&m.CreatedAt,
	)
}

func (r *SupportRepo) CreateTicketWithInitialMessage(
	ctx context.Context,
	orgID, createdByUserID, subject, body string,
) (*domain.SupportTicket, *domain.SupportMessage, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var ticket domain.SupportTicket
	if err := scanSupportTicket(
		tx.QueryRow(ctx, `
			INSERT INTO support_tickets (org_id, created_by_user_id, subject, status)
			VALUES ($1, $2, $3, 'open')
			RETURNING id, org_id, created_by_user_id, assigned_admin_user_id, subject, status, created_at, updated_at, last_message_at, resolved_at
		`, orgID, createdByUserID, subject),
		&ticket,
	); err != nil {
		return nil, nil, fmt.Errorf("create ticket: %w", err)
	}

	var msg domain.SupportMessage
	if err := scanSupportMessage(
		tx.QueryRow(ctx, `
			INSERT INTO support_messages (ticket_id, sender_user_id, sender_org_id, sender_is_platform, body)
			VALUES ($1, $2, $3, false, $4)
			RETURNING id, ticket_id, sender_user_id, sender_org_id, sender_is_platform, body, created_at
		`, ticket.ID, createdByUserID, orgID, body),
		&msg,
	); err != nil {
		return nil, nil, fmt.Errorf("create message: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE support_tickets
		SET last_message_at = $2, updated_at = now()
		WHERE id = $1
	`, ticket.ID, msg.CreatedAt); err != nil {
		return nil, nil, fmt.Errorf("update ticket timestamp: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, fmt.Errorf("commit tx: %w", err)
	}

	ticket.LastMessageAt = msg.CreatedAt
	return &ticket, &msg, nil
}

func (r *SupportRepo) ListOrgTickets(ctx context.Context, orgID, status string, page, perPage int) ([]domain.SupportTicket, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	clauses := []string{"org_id = $1"}
	args := []any{orgID}
	next := 2

	status = strings.TrimSpace(status)
	if status != "" {
		clauses = append(clauses, "status = $"+strconv.Itoa(next))
		args = append(args, status)
		next++
	}

	where := " WHERE " + strings.Join(clauses, " AND ")
	var total int
	if err := r.pool.QueryRow(ctx, "SELECT COUNT(*) FROM support_tickets"+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count org tickets: %w", err)
	}

	query := `
		SELECT id, org_id, created_by_user_id, assigned_admin_user_id, subject, status, created_at, updated_at, last_message_at, resolved_at
		FROM support_tickets` + where + `
		ORDER BY last_message_at DESC
		LIMIT $` + strconv.Itoa(next) + ` OFFSET $` + strconv.Itoa(next+1)
	rows, err := r.pool.Query(ctx, query, append(args, perPage, offset)...)
	if err != nil {
		return nil, 0, fmt.Errorf("list org tickets: %w", err)
	}
	defer rows.Close()

	items := make([]domain.SupportTicket, 0)
	for rows.Next() {
		var t domain.SupportTicket
		if err := scanSupportTicket(rows, &t); err != nil {
			return nil, 0, fmt.Errorf("scan org ticket: %w", err)
		}
		items = append(items, t)
	}
	return items, total, nil
}

func (r *SupportRepo) ListPlatformTickets(
	ctx context.Context,
	status, orgID, assignedTo string,
	page, perPage int,
) ([]domain.SupportTicket, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	clauses := []string{"1=1"}
	args := []any{}
	next := 1

	status = strings.TrimSpace(status)
	orgID = strings.TrimSpace(orgID)
	assignedTo = strings.TrimSpace(assignedTo)

	if status != "" {
		clauses = append(clauses, "status = $"+strconv.Itoa(next))
		args = append(args, status)
		next++
	}
	if orgID != "" {
		clauses = append(clauses, "org_id = $"+strconv.Itoa(next))
		args = append(args, orgID)
		next++
	}
	if assignedTo != "" {
		if strings.EqualFold(assignedTo, "unassigned") {
			clauses = append(clauses, "assigned_admin_user_id IS NULL")
		} else {
			clauses = append(clauses, "assigned_admin_user_id = $"+strconv.Itoa(next))
			args = append(args, assignedTo)
			next++
		}
	}

	where := " WHERE " + strings.Join(clauses, " AND ")
	var total int
	if err := r.pool.QueryRow(ctx, "SELECT COUNT(*) FROM support_tickets"+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count platform tickets: %w", err)
	}

	query := `
		SELECT id, org_id, created_by_user_id, assigned_admin_user_id, subject, status, created_at, updated_at, last_message_at, resolved_at
		FROM support_tickets` + where + `
		ORDER BY last_message_at DESC
		LIMIT $` + strconv.Itoa(next) + ` OFFSET $` + strconv.Itoa(next+1)
	rows, err := r.pool.Query(ctx, query, append(args, perPage, offset)...)
	if err != nil {
		return nil, 0, fmt.Errorf("list platform tickets: %w", err)
	}
	defer rows.Close()

	items := make([]domain.SupportTicket, 0)
	for rows.Next() {
		var t domain.SupportTicket
		if err := scanSupportTicket(rows, &t); err != nil {
			return nil, 0, fmt.Errorf("scan platform ticket: %w", err)
		}
		items = append(items, t)
	}
	return items, total, nil
}

func (r *SupportRepo) GetOrgTicketByID(ctx context.Context, orgID, ticketID string) (*domain.SupportTicket, error) {
	var t domain.SupportTicket
	if err := scanSupportTicket(r.pool.QueryRow(ctx, `
		SELECT id, org_id, created_by_user_id, assigned_admin_user_id, subject, status, created_at, updated_at, last_message_at, resolved_at
		FROM support_tickets
		WHERE id = $1 AND org_id = $2
	`, ticketID, orgID), &t); err != nil {
		return nil, fmt.Errorf("get org ticket: %w", err)
	}
	return &t, nil
}

func (r *SupportRepo) GetTicketByID(ctx context.Context, ticketID string) (*domain.SupportTicket, error) {
	var t domain.SupportTicket
	if err := scanSupportTicket(r.pool.QueryRow(ctx, `
		SELECT id, org_id, created_by_user_id, assigned_admin_user_id, subject, status, created_at, updated_at, last_message_at, resolved_at
		FROM support_tickets
		WHERE id = $1
	`, ticketID), &t); err != nil {
		return nil, fmt.Errorf("get ticket: %w", err)
	}
	return &t, nil
}

func (r *SupportRepo) ListMessagesForOrgTicket(ctx context.Context, orgID, ticketID string) ([]domain.SupportMessage, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT m.id, m.ticket_id, m.sender_user_id, m.sender_org_id, m.sender_is_platform, m.body, m.created_at
		FROM support_messages m
		INNER JOIN support_tickets t ON t.id = m.ticket_id
		WHERE m.ticket_id = $1 AND t.org_id = $2
		ORDER BY m.created_at ASC
	`, ticketID, orgID)
	if err != nil {
		return nil, fmt.Errorf("list org messages: %w", err)
	}
	defer rows.Close()

	items := make([]domain.SupportMessage, 0)
	for rows.Next() {
		var m domain.SupportMessage
		if err := scanSupportMessage(rows, &m); err != nil {
			return nil, fmt.Errorf("scan org message: %w", err)
		}
		items = append(items, m)
	}
	return items, nil
}

func (r *SupportRepo) ListMessagesForTicket(ctx context.Context, ticketID string) ([]domain.SupportMessage, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, ticket_id, sender_user_id, sender_org_id, sender_is_platform, body, created_at
		FROM support_messages
		WHERE ticket_id = $1
		ORDER BY created_at ASC
	`, ticketID)
	if err != nil {
		return nil, fmt.Errorf("list ticket messages: %w", err)
	}
	defer rows.Close()

	items := make([]domain.SupportMessage, 0)
	for rows.Next() {
		var m domain.SupportMessage
		if err := scanSupportMessage(rows, &m); err != nil {
			return nil, fmt.Errorf("scan ticket message: %w", err)
		}
		items = append(items, m)
	}
	return items, nil
}

func (r *SupportRepo) AddMessage(
	ctx context.Context,
	ticketID, senderUserID, senderOrgID string,
	senderIsPlatform bool,
	body string,
) (*domain.SupportMessage, *domain.SupportTicket, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var msg domain.SupportMessage
	if err := scanSupportMessage(tx.QueryRow(ctx, `
		INSERT INTO support_messages (ticket_id, sender_user_id, sender_org_id, sender_is_platform, body)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, ticket_id, sender_user_id, sender_org_id, sender_is_platform, body, created_at
	`, ticketID, senderUserID, senderOrgID, senderIsPlatform, body), &msg); err != nil {
		return nil, nil, fmt.Errorf("add message: %w", err)
	}

	var ticket domain.SupportTicket
	if err := scanSupportTicket(tx.QueryRow(ctx, `
		UPDATE support_tickets
		SET
			status = CASE WHEN status = 'resolved' THEN 'in_progress' ELSE status END,
			resolved_at = CASE WHEN status = 'resolved' THEN NULL ELSE resolved_at END,
			last_message_at = $2,
			updated_at = now()
		WHERE id = $1
		RETURNING id, org_id, created_by_user_id, assigned_admin_user_id, subject, status, created_at, updated_at, last_message_at, resolved_at
	`, ticketID, msg.CreatedAt), &ticket); err != nil {
		return nil, nil, fmt.Errorf("update ticket after message: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, fmt.Errorf("commit tx: %w", err)
	}
	return &msg, &ticket, nil
}

func (r *SupportRepo) UpdateTicketForPlatform(
	ctx context.Context,
	ticketID string,
	status *string,
	assignedAdminUserID *string,
	setAssigned bool,
) (*domain.SupportTicket, error) {
	sets := []string{}
	args := []any{}
	next := 1

	if status != nil {
		sets = append(sets, "status = $"+strconv.Itoa(next))
		args = append(args, *status)
		next++
		sets = append(sets, "resolved_at = CASE WHEN $"+strconv.Itoa(next-1)+" = 'resolved' THEN now() ELSE NULL END")
	}

	if setAssigned {
		sets = append(sets, "assigned_admin_user_id = $"+strconv.Itoa(next))
		args = append(args, assignedAdminUserID)
		next++
	}

	if len(sets) == 0 {
		return r.GetTicketByID(ctx, ticketID)
	}

	sets = append(sets, "updated_at = now()")
	query := `
		UPDATE support_tickets
		SET ` + strings.Join(sets, ", ") + `
		WHERE id = $` + strconv.Itoa(next) + `
		RETURNING id, org_id, created_by_user_id, assigned_admin_user_id, subject, status, created_at, updated_at, last_message_at, resolved_at`
	args = append(args, ticketID)

	var ticket domain.SupportTicket
	if err := scanSupportTicket(r.pool.QueryRow(ctx, query, args...), &ticket); err != nil {
		return nil, fmt.Errorf("update ticket: %w", err)
	}
	return &ticket, nil
}
