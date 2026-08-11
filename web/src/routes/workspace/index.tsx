/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'

import { WorkspacePage } from '@/features/workspace'
import { useAuthStore } from '@/stores/auth-store'

const workspaceSearchSchema = z.object({
  type: z.enum(['text', 'image', 'video']).optional(),
  caseId: z.coerce.number().int().positive().optional(),
})

export const Route = createFileRoute('/workspace/')({
  validateSearch: workspaceSearchSchema,
  beforeLoad: ({ location }) => {
    const auth = useAuthStore.getState().auth
    if (!auth.user || !auth.accessToken) {
      throw redirect({
        to: '/sign-in',
        search: { redirect: location.href },
      })
    }
  },
  component: WorkspaceRoute,
})

function WorkspaceRoute() {
  const search = Route.useSearch()
  return <WorkspacePage caseId={search.caseId} initialType={search.type} />
}
