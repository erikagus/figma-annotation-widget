export type CategoryId = 'spec' | 'dev' | 'fix' | 'review' | 'todo'
export type StatusId = 'open' | 'progress' | 'resolved' | 'na'
export type PointerSide = 'top' | 'bottom' | 'left' | 'right' | 'none'
export type PinLength = 'short' | 'long'

export const CATEGORIES: Record<CategoryId, { label: string; color: string }> = {
  spec: { label: 'Spec', color: '#3B82F6' },
  dev: { label: 'Dev Note', color: '#8B5CF6' },
  fix: { label: 'Fix / Bug', color: '#EF4444' },
  review: { label: 'Review', color: '#8ED16B' },
  todo: { label: 'To-Do', color: '#F59E0B' },
}

export const STATUSES: Record<StatusId, { label: string }> = {
  open: { label: 'Open' },
  progress: { label: 'In Progress' },
  resolved: { label: 'Resolved' },
  na: { label: 'N/A' },
}

export const POINTERS: Record<PointerSide, string> = {
  top: 'Top',
  bottom: 'Bottom',
  left: 'Left',
  right: 'Right',
  none: 'None',
}

export const PIN_LENGTHS: Record<PinLength, number> = { short: 40, long: 120 }

export interface Author {
  name: string
  photoUrl: string | null
}

export interface Reply {
  id: string
  author: Author
  text: string
  createdAt: number
}

export interface AnnotationData {
  category: CategoryId
  status: StatusId
  text: string
  author: Author | null
  createdAt: number
  replies: Reply[]
  target?: LayerLink | null
}

export interface LayerLink {
  id: string
  name: string
}
