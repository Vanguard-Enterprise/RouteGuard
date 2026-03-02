package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SMSRepo handles sms_messages queries.
type SMSRepo struct {
	pool *pgxpool.Pool
}

// NewSMSRepo creates a new SMSRepo.
func NewSMSRepo(pool *pgxpool.Pool) *SMSRepo {
	return &SMSRepo{pool: pool}
}

// UpdateSMSStatus updates the status of an sms_messages row by twilio_sid.
// Also sets sent_at = NOW() when status = 'sent'.
func (r *SMSRepo) UpdateSMSStatus(ctx context.Context, twilioSID, status string) error {
	var q string
	if status == "sent" {
		q = `UPDATE sms_messages SET status = $1, sent_at = NOW() WHERE twilio_sid = $2`
	} else {
		q = `UPDATE sms_messages SET status = $1 WHERE twilio_sid = $2`
	}
	_, err := r.pool.Exec(ctx, q, status, twilioSID)
	if err != nil {
		return fmt.Errorf("sms update status: %w", err)
	}
	return nil
}
