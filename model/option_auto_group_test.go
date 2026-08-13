package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateOptionValueRejectsInvalidMaxTokenAutoGroups(t *testing.T) {
	for _, value := range []string{"", "0", "-1", "1.5", "invalid"} {
		t.Run(value, func(t *testing.T) {
			assert.Error(t, validateOptionValue("MaxTokenAutoGroups", value))
		})
	}
	require.NoError(t, validateOptionValue("MaxTokenAutoGroups", "999999"))
}

func TestValidateOptionValueChecksWorkspaceModelMediaRules(t *testing.T) {
	require.NoError(t, validateOptionValue(
		"global.workspace_model_media_rules",
		`[{"type":"video","pattern":"(^|/)custom-video"}]`,
	))
	assert.Error(t, validateOptionValue(
		"global.workspace_model_media_rules",
		`[{"type":"audio","pattern":"audio"}]`,
	))
}
