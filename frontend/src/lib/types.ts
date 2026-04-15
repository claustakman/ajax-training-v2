// Delte TypeScript-typer — bruges af frontend og refereres i worker

export interface Training {
  id: string
  team_id: string
  title?: string
  date?: string
  start_time?: string
  end_time?: string
  location?: string
  lead_trainer?: string
  trainers: string[]
  themes: string[]
  focus_points?: string
  notes?: string
  participant_count?: number
  sections: Section[]
  stars: number
  archived: boolean
  holdsport_id?: string
  created_by?: string
  created_at: string
  updated_at: string
}

export interface Section {
  id: string
  type: string
  mins: number
  group?: string
  exercises: SectionExercise[]
  note?: string
}

export interface SectionExercise {
  id?: string           // NULL = fri øvelse
  customName?: string   // bruges ved fri øvelse
  mins: number
  done: boolean
}

export interface Template {
  id: string
  team_id: string
  name: string
  sections: Section[]
  created_by?: string
  created_at: string
}

export interface SectionType {
  id: string
  label: string
  color: string
  cls: string
  tags: string[]
  themes: string[]
  required: number
  sort_order: number
  team_id: string | null
}
