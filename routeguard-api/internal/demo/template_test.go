package demo

import "testing"

func TestGenerateDatasetIsDeterministic(t *testing.T) {
	first, err := GenerateDataset("large-county-v1")
	if err != nil {
		t.Fatalf("generate first dataset: %v", err)
	}
	second, err := GenerateDataset("large-county-v1")
	if err != nil {
		t.Fatalf("generate second dataset: %v", err)
	}

	if first.OrgName != second.OrgName || len(first.Students) != len(second.Students) || len(first.Routes) != len(second.Routes) {
		t.Fatal("expected deterministic dataset shape")
	}
	if first.Students[0] != second.Students[0] {
		t.Fatal("expected deterministic first student")
	}
	if first.Routes[0].RouteCode != second.Routes[0].RouteCode {
		t.Fatal("expected deterministic route codes")
	}
}
