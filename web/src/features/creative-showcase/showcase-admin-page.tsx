/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import {
  getShowcaseCases,
  getShowcaseCategories,
  removeShowcaseCase,
  removeShowcaseCategory,
  saveShowcaseCase,
  saveShowcaseCategory,
} from './api'
import type {
  ShowcaseCase,
  ShowcaseCaseInput,
  ShowcaseCaseType,
  ShowcaseCategory,
} from './types'
import { uploadShowcaseAsset } from './upload'

const emptyCase: ShowcaseCaseInput = {
  title: '',
  type: 'image',
  category_id: 0,
  cover_key: '',
  media_key: '',
  prompt: '',
  size: '',
  aspect_ratio: '',
  duration: 0,
  model: '',
  group: '',
  start_frame: '',
  end_frame: '',
  featured: false,
  published: false,
  sort_order: 0,
}

export function CreativeShowcaseAdminPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [type, setType] = useState<ShowcaseCaseType>('image')
  const [editing, setEditing] = useState<ShowcaseCase>()
  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState<ShowcaseCaseInput>(emptyCase)
  const categories = useQuery({
    queryKey: ['creative-showcase', 'admin', 'categories'],
    queryFn: () => getShowcaseCategories(true),
  })
  const cases = useQuery({
    queryKey: ['creative-showcase', 'admin', 'cases', type],
    queryFn: () => getShowcaseCases({ page: 1, type, admin: true }),
  })
  const refresh = async () =>
    queryClient.invalidateQueries({ queryKey: ['creative-showcase'] })
  const saveCase = useMutation({
    mutationFn: () => saveShowcaseCase(form, editing?.id),
    onSuccess: async () => {
      toast.success(t('Case saved'))
      setEditing(undefined)
      setEditorOpen(false)
      setForm(emptyCase)
      await refresh()
    },
    onError: () => toast.error(t('Unable to save case')),
  })
  const deleteCase = useMutation({
    mutationFn: removeShowcaseCase,
    onSuccess: refresh,
    onError: () => toast.error(t('Unable to delete case')),
  })

  const startEdit = (item?: ShowcaseCase) => {
    if (!item) {
      setEditing(undefined)
      setForm({
        ...emptyCase,
        type,
        category_id: categories.data?.[0]?.id ?? 0,
      })
      setEditorOpen(true)
      return
    }
    setEditing(item)
    setForm({
      title: item.title,
      type: item.type,
      category_id: item.category_id,
      cover_key: item.cover_key ?? '',
      media_key: item.media_key ?? '',
      prompt: item.prompt,
      size: item.size ?? '',
      aspect_ratio: item.aspect_ratio ?? '',
      duration: item.duration ?? 0,
      model: item.model ?? '',
      group: item.group ?? '',
      start_frame: item.start_frame_key ?? '',
      end_frame: item.end_frame_key ?? '',
      featured: item.featured,
      published: item.published,
      sort_order: item.sort_order,
    })
    setEditorOpen(true)
  }

  return (
    <main className='h-dvh overflow-y-auto'>
      <div className='mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8'>
        <header className='flex flex-wrap items-end justify-between gap-4'>
          <h1 className='text-3xl font-semibold'>{t('Manage cases')}</h1>
          <Button onClick={() => startEdit()}>{t('New case')}</Button>
        </header>
        <CategoryManager
          categories={categories.data ?? []}
          onChanged={refresh}
        />
        <section className='bg-card rounded-xl border'>
          <div className='flex items-center justify-between border-b p-4'>
            <div className='flex gap-2'>
              <Button
                size='sm'
                variant={type === 'image' ? 'default' : 'outline'}
                onClick={() => setType('image')}
              >
                {t('Image generation')}
              </Button>
              <Button
                size='sm'
                variant={type === 'video' ? 'default' : 'outline'}
                onClick={() => setType('video')}
              >
                {t('Video generation')}
              </Button>
            </div>
            <span className='text-muted-foreground text-sm'>
              {cases.data?.total ?? 0} {t('cases')}
            </span>
          </div>
          <div className='divide-y'>
            {cases.data?.items.map((item) => (
              <div className='flex items-center gap-4 p-4' key={item.id}>
                <img
                  alt=''
                  className='size-16 rounded object-cover'
                  src={item.cover_url}
                />
                <div className='min-w-0 flex-1'>
                  <p className='truncate font-medium'>{item.title}</p>
                  <p className='text-muted-foreground truncate text-sm'>
                    {item.prompt}
                  </p>
                </div>
                <span className='text-muted-foreground text-sm'>
                  {item.published ? t('Published') : t('Draft')}
                </span>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => startEdit(item)}
                >
                  {t('Edit')}
                </Button>
                <Button
                  size='sm'
                  variant='destructive'
                  onClick={() => {
                    if (window.confirm(t('Delete this case?'))) {
                      deleteCase.mutate(item.id)
                    }
                  }}
                >
                  {t('Delete')}
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
      <CaseEditor
        open={editorOpen}
        form={form}
        categories={categories.data ?? []}
        onChange={setForm}
        onCancel={() => {
          setEditing(undefined)
          setEditorOpen(false)
          setForm(emptyCase)
        }}
        onSave={() => saveCase.mutate()}
        saving={saveCase.isPending}
      />
    </main>
  )
}

function CategoryManager(props: {
  categories: ShowcaseCategory[]
  onChanged: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await saveShowcaseCategory({
        id: 0,
        name: name.trim(),
        sort_order: props.categories.length,
      })
      setName('')
      await props.onChanged()
    } catch {
      toast.error(t('Unable to save category'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <section className='bg-card rounded-xl border p-4'>
      <h2 className='font-semibold'>{t('Categories')}</h2>
      <div className='mt-3 flex flex-wrap gap-2'>
        {props.categories.map((category) => (
          <span
            className='bg-muted inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm'
            key={category.id}
          >
            {category.name}
            <button
              aria-label={t('Delete')}
              className='text-muted-foreground hover:text-destructive'
              type='button'
              onClick={async () => {
                if (window.confirm(t('Delete this category?'))) {
                  try {
                    await removeShowcaseCategory(category.id)
                    await props.onChanged()
                  } catch {
                    toast.error(t('Delete or move the category cases first'))
                  }
                }
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className='mt-4 flex max-w-md gap-2'>
        <Input
          aria-label={t('New category')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('New category')}
        />
        <Button disabled={saving} onClick={save}>
          {t('Add category')}
        </Button>
      </div>
    </section>
  )
}

function CaseEditor(props: {
  open: boolean
  form: ShowcaseCaseInput
  categories: ShowcaseCategory[]
  onChange: (next: ShowcaseCaseInput) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState<string>()
  const typeItems = [
    { value: 'image', label: t('Image generation') },
    { value: 'video', label: t('Video generation') },
  ]
  const categoryItems = props.categories.map((category) => ({
    value: category.id,
    label: category.name,
  }))
  const set = <K extends keyof ShowcaseCaseInput>(
    key: K,
    value: ShowcaseCaseInput[K]
  ) => props.onChange({ ...props.form, [key]: value })
  const upload = async (
    field: 'cover_key' | 'media_key' | 'start_frame' | 'end_frame',
    file?: File
  ) => {
    if (!file) return
    setUploading(field)
    try {
      set(field, await uploadShowcaseAsset(file))
      toast.success(t('Asset uploaded'))
    } catch {
      toast.error(t('Unable to upload asset'))
    } finally {
      setUploading(undefined)
    }
  }
  const cannotSave =
    props.saving ||
    Boolean(uploading) ||
    !props.form.cover_key ||
    !props.form.title ||
    !props.form.category_id ||
    !props.form.prompt
  return (
    <Sheet open={props.open} onOpenChange={(open) => !open && props.onCancel()}>
      <SheetContent className={sideDrawerContentClassName('sm:max-w-[640px]')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>{t('Case details')}</SheetTitle>
        </SheetHeader>
        <form
          id='creative-showcase-case-form'
          className={sideDrawerFormClassName()}
          onSubmit={(event) => {
            event.preventDefault()
            props.onSave()
          }}
        >
          <div className='grid gap-4 md:grid-cols-2'>
            <Field label={t('Case title')}>
              <Input
                value={props.form.title}
                onChange={(event) => set('title', event.target.value)}
              />
            </Field>
            <Field label={t('Case type')}>
              <Select
                items={typeItems}
                value={props.form.type}
                onValueChange={(value) =>
                  set('type', value as ShowcaseCaseType)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='image'>{t('Image generation')}</SelectItem>
                  <SelectItem value='video'>{t('Video generation')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('Category')}>
              <Select
                items={categoryItems}
                value={props.form.category_id}
                onValueChange={(value) => set('category_id', value ?? 0)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('Select category')} />
                </SelectTrigger>
                <SelectContent>
                  {props.categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('Sort order')}>
              <Input
                min='0'
                type='number'
                value={props.form.sort_order}
                onChange={(event) =>
                  set('sort_order', Number(event.target.value))
                }
              />
            </Field>
            <AssetField
              label={t('Cover image')}
              uploading={uploading === 'cover_key'}
              onChange={(file) => upload('cover_key', file)}
              value={props.form.cover_key}
            />
            {props.form.type === 'video' && (
              <AssetField
                label={t('Video file')}
                uploading={uploading === 'media_key'}
                onChange={(file) => upload('media_key', file)}
                value={props.form.media_key ?? ''}
                accept='video/*'
              />
            )}
            <Field label={t('Output size')}>
              <Input
                value={props.form.size}
                onChange={(event) => set('size', event.target.value)}
                placeholder='1024x1024'
              />
            </Field>
            {props.form.type === 'video' && (
              <>
                <Field label={t('Aspect ratio')}>
                  <Input
                    value={props.form.aspect_ratio}
                    onChange={(event) =>
                      set('aspect_ratio', event.target.value)
                    }
                    placeholder='16:9'
                  />
                </Field>
                <Field label={t('Duration (seconds)')}>
                  <Input
                    min='0'
                    max='600'
                    type='number'
                    value={props.form.duration}
                    onChange={(event) =>
                      set('duration', Number(event.target.value))
                    }
                  />
                </Field>
              </>
            )}
          </div>
          <Field label={t('Prompt text')}>
            <Textarea
              className='min-h-36'
              value={props.form.prompt}
              onChange={(event) => set('prompt', event.target.value)}
            />
          </Field>
          <div className='flex flex-wrap items-center gap-3'>
            <Switch
              checked={props.form.featured}
              onCheckedChange={(checked) => set('featured', checked)}
            />
            <Label>{t('Featured cases')}</Label>
            <Switch
              checked={props.form.published}
              onCheckedChange={(checked) => set('published', checked)}
            />
            <Label>{t('Published')}</Label>
          </div>
        </form>
        <SheetFooter className={sideDrawerFooterClassName()}>
          <Button type='button' variant='outline' onClick={props.onCancel}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={cannotSave}
            form='creative-showcase-case-form'
            type='submit'
          >
            {props.saving ? t('Saving...') : t('Save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <div className='grid gap-2'>
      <Label>{props.label}</Label>
      {props.children}
    </div>
  )
}
function AssetField(props: {
  label: string
  value: string
  uploading: boolean
  accept?: string
  onChange: (file?: File) => void
}) {
  return (
    <Field label={props.label}>
      <div className='flex items-center gap-2'>
        <Input
          accept={props.accept ?? 'image/*'}
          disabled={props.uploading}
          type='file'
          onChange={(event) => props.onChange(event.target.files?.[0])}
        />
        <span className='text-muted-foreground max-w-32 truncate text-xs'>
          {props.uploading ? '...' : props.value || '-'}
        </span>
      </div>
    </Field>
  )
}
