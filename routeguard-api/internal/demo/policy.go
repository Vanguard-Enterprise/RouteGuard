package demo

const (
	ActionSuspend             = "suspend"
	ActionDelete              = "delete"
	ActionUpdateOrg           = "update-org"
	ActionUpdateBillingStatus = "update-billing-status"
)

func IsProtectedAction(action string) bool {
	switch action {
	case ActionSuspend, ActionDelete, ActionUpdateOrg, ActionUpdateBillingStatus:
		return true
	default:
		return false
	}
}
