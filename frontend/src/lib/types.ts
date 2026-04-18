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
  type: 'training' | 'section'   // 'training' = fuld træning, 'section' = én sektion
  section_type?: string           // sektionstype-id hvis type='section', fx "opvarmning"
  themes: string[]                // temaer skabelonen dækker
  description?: string            // fri beskrivelse
  sections: Section[]             // ved type='section': kun ét element
  created_by?: string
  created_at: string
}

export interface Exercise {
  id: string
  name: string
  description?: string
  catalog: 'hal' | 'fys'
  category?: string
  tags: string[]
  age_groups: string[]
  stars: number
  variants?: string
  link?: string
  default_mins?: number
  image_url?: string
  image_r2_key?: string
  created_by?: string
  created_by_email?: string
  created_at: string
  updated_at: string
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

export interface HoldsportActivity {
  id: string | number
  name?: string
  title?: string
  starttime?: string
  endtime?: string
  place?: string
  location?: string
  attendance_count?: number
  signups_count?: number
  _teamId?: string | number
  _teamName?: string
  [key: string]: unknown
}
