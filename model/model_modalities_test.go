package model

import (
	"fmt"
	"strings"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func useModelModalitiesTestDB(t *testing.T) {
	t.Helper()
	originalDB := DB
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Model{}))
	DB = db
	t.Cleanup(func() {
		DB = originalDB
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			require.NoError(t, sqlDB.Close())
		}
	})
}

func TestNormalizeModelModalitiesUsesCanonicalOrderAndRejectsUnknownValues(t *testing.T) {
	normalized, err := NormalizeModelModalities([]string{" video ", "TEXT", "image", "video"})
	require.NoError(t, err)
	assert.Equal(t, []string{"text", "image", "video"}, normalized)

	_, err = NormalizeModelModalities([]string{"binary"})
	require.ErrorContains(t, err, "unsupported model modality")
}

func TestModelModalitiesPersistAndFilterByOutputType(t *testing.T) {
	useModelModalitiesTestDB(t)

	models := []*Model{
		{ModelName: "text-model", InputModalities: []string{"text"}, OutputModalities: []string{"text"}, Status: 1},
		{ModelName: "media-model", InputModalities: []string{"video", "text"}, OutputModalities: []string{"video", "image"}, Status: 1},
		{ModelName: "unclassified-model", Status: 1},
	}
	for _, item := range models {
		require.NoError(t, item.Insert())
	}

	filtered, total, err := SearchModels("", "", "", "", "image", 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, filtered, 1)
	assert.Equal(t, "media-model", filtered[0].ModelName)
	assert.Equal(t, []string{"text", "video"}, filtered[0].InputModalities)
	assert.Equal(t, []string{"image", "video"}, filtered[0].OutputModalities)

	unclassified, total, err := SearchModels("", "", "", "", "unclassified", 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, unclassified, 1)
	assert.Equal(t, "unclassified-model", unclassified[0].ModelName)
}
