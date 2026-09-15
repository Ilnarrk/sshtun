package model

import (
	"slices"
	"testing"
)

func validProfile() Profile {
	return Profile{
		ID: "profile-1", Name: "Demo", Host: "example.org", User: "root",
		Port: "022", SocksPort: "01080", AcceptNewHostKey: true,
		Forwards: []PortForward{{ID: "forward-1", LocalPort: "03000", RemoteHost: "::1", RemotePort: "3000"}},
	}
}

func TestSSHArgsNormalisePortsAndIPv6(t *testing.T) {
	args, err := validProfile().SSHArgs(true)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"-D", "127.0.0.1:1080", "-L", "127.0.0.1:3000:[::1]:3000", "-o", "BatchMode=yes"}
	for _, value := range want {
		if !slices.Contains(args, value) {
			t.Fatalf("missing %q in %#v", value, args)
		}
	}
}

func TestValidateRejectsNormalisedDuplicatePorts(t *testing.T) {
	p := validProfile()
	p.Forwards[0].LocalPort = "01080"
	if err := p.Validate(); err == nil {
		t.Fatal("expected duplicate local port error")
	}
}

func TestNormalizeWorkspaceRepairsDuplicateIDs(t *testing.T) {
	workspace := Workspace{
		Profiles: []Profile{
			{ID: "same", Name: "One", Forwards: []PortForward{{ID: "forward"}, {ID: "forward"}}},
			{ID: "same", Name: "Two"},
		},
		SelectedProfileID: "same",
	}
	got := NormalizeWorkspace(workspace)
	if got.Profiles[0].ID == got.Profiles[1].ID {
		t.Fatal("duplicate profile IDs were not repaired")
	}
	if got.Profiles[0].Forwards[0].ID == got.Profiles[0].Forwards[1].ID {
		t.Fatal("duplicate forward IDs were not repaired")
	}
}
