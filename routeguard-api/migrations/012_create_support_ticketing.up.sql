CREATE TABLE support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sender_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    sender_is_platform BOOLEAN NOT NULL DEFAULT false,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_tickets_status_last_message
    ON support_tickets (status, last_message_at DESC);
CREATE INDEX idx_support_tickets_org_last_message
    ON support_tickets (org_id, last_message_at DESC);
CREATE INDEX idx_support_tickets_assigned_admin_status
    ON support_tickets (assigned_admin_user_id, status);
CREATE INDEX idx_support_messages_ticket_created
    ON support_messages (ticket_id, created_at);
