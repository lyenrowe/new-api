/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
package creative_showcase

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestMigrateCreatesDefaultCategoriesIdempotently(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:creative_showcase_test?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, Migrate(db))
	require.NoError(t, Migrate(db))

	var categories []Category
	require.NoError(t, db.Order("sort_order asc").Find(&categories).Error)
	require.Len(t, categories, 4)
	require.Equal(t, "AI漫剧", categories[0].Name)
}
