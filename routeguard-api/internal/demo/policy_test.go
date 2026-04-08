package demo

import "testing"

func TestIsProtectedAction(t *testing.T) {
	if !IsProtectedAction(ActionSuspend) {
		t.Fatal("expected suspend to be protected")
	}
	if !IsProtectedAction(ActionDelete) {
		t.Fatal("expected delete to be protected")
	}
	if IsProtectedAction("noop") {
		t.Fatal("did not expect noop to be protected")
	}
}
