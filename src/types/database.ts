/**
 * Supabase のスキーマ型。
 *
 * 本来は `npm run db:types`（= supabase gen types typescript --local）で生成するファイル。
 * このコンテナには Docker が無く生成できなかったため、生成物と同じ形で手書きしている。
 * ホスト側で `supabase start` したら再生成して上書きすること（差分が出たらスキーマ側が正）。
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string
          avatar_url: string | null
          default_timer_minutes: number
          default_slot_minutes: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name: string
          avatar_url?: string | null
          default_timer_minutes?: number
          default_slot_minutes?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string
          avatar_url?: string | null
          default_timer_minutes?: number
          default_slot_minutes?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      models: {
        Row: {
          id: string
          user_id: string
          name: string
          name_kana: string | null
          avatar_url: string | null
          sns_links: Json
          contact_method: string | null
          contact_value: string | null
          affiliation: string | null
          tags: string[]
          rating: number | null
          is_favorite: boolean
          status: Database['public']['Enums']['model_status']
          notes: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          name_kana?: string | null
          avatar_url?: string | null
          sns_links?: Json
          contact_method?: string | null
          contact_value?: string | null
          affiliation?: string | null
          tags?: string[]
          rating?: number | null
          is_favorite?: boolean
          status?: Database['public']['Enums']['model_status']
          notes?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          name_kana?: string | null
          avatar_url?: string | null
          sns_links?: Json
          contact_method?: string | null
          contact_value?: string | null
          affiliation?: string | null
          tags?: string[]
          rating?: number | null
          is_favorite?: boolean
          status?: Database['public']['Enums']['model_status']
          notes?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      organizers: {
        Row: {
          id: string
          user_id: string
          name: string
          name_kana: string | null
          url: string | null
          contact: string | null
          notes: string | null
          is_favorite: boolean
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          name_kana?: string | null
          url?: string | null
          contact?: string | null
          notes?: string | null
          is_favorite?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          name_kana?: string | null
          url?: string | null
          contact?: string | null
          notes?: string | null
          is_favorite?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      venues: {
        Row: {
          id: string
          user_id: string
          name: string
          kind: Database['public']['Enums']['venue_kind']
          address: string | null
          url: string | null
          nearest_station: string | null
          hourly_rate: number | null
          notes: string | null
          is_favorite: boolean
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          kind?: Database['public']['Enums']['venue_kind']
          address?: string | null
          url?: string | null
          nearest_station?: string | null
          hourly_rate?: number | null
          notes?: string | null
          is_favorite?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          kind?: Database['public']['Enums']['venue_kind']
          address?: string | null
          url?: string | null
          nearest_station?: string | null
          hourly_rate?: number | null
          notes?: string | null
          is_favorite?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      sessions: {
        Row: {
          id: string
          user_id: string
          title: string
          session_date: string
          shoot_type: Database['public']['Enums']['shoot_type']
          status: Database['public']['Enums']['session_status']
          venue_id: string | null
          venue_name: string | null
          organizer_id: string | null
          organizer: string | null
          booking_opens_at: string | null
          booking_method: Database['public']['Enums']['booking_method'] | null
          booking_contact: string | null
          concept: string | null
          start_at: string | null
          end_at: string | null
          studio_cost: number
          transport_cost: number
          entry_cost: number
          other_cost: number
          other_cost_note: string | null
          weather_note: string | null
          memo: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          session_date: string
          shoot_type?: Database['public']['Enums']['shoot_type']
          status?: Database['public']['Enums']['session_status']
          venue_id?: string | null
          venue_name?: string | null
          organizer_id?: string | null
          organizer?: string | null
          booking_opens_at?: string | null
          booking_method?: Database['public']['Enums']['booking_method'] | null
          booking_contact?: string | null
          concept?: string | null
          start_at?: string | null
          end_at?: string | null
          studio_cost?: number
          transport_cost?: number
          entry_cost?: number
          other_cost?: number
          other_cost_note?: string | null
          weather_note?: string | null
          memo?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          session_date?: string
          shoot_type?: Database['public']['Enums']['shoot_type']
          status?: Database['public']['Enums']['session_status']
          venue_id?: string | null
          venue_name?: string | null
          organizer_id?: string | null
          organizer?: string | null
          booking_opens_at?: string | null
          booking_method?: Database['public']['Enums']['booking_method'] | null
          booking_contact?: string | null
          concept?: string | null
          start_at?: string | null
          end_at?: string | null
          studio_cost?: number
          transport_cost?: number
          entry_cost?: number
          other_cost?: number
          other_cost_note?: string | null
          weather_note?: string | null
          memo?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'sessions_venue_id_fkey'
            columns: ['venue_id']
            isOneToOne: false
            referencedRelation: 'venues'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sessions_organizer_id_fkey'
            columns: ['organizer_id']
            isOneToOne: false
            referencedRelation: 'organizers'
            referencedColumns: ['id']
          },
        ]
      }
      slots: {
        Row: {
          id: string
          user_id: string
          session_id: string
          slot_no: number
          label: string | null
          start_at: string
          planned_minutes: number
          end_at: string | null
          timer_status: Database['public']['Enums']['timer_status']
          timer_started_at: string | null
          timer_ends_at: string | null
          timer_remaining_sec: number | null
          timer_finished_at: string | null
          extended_minutes: number
          booking_fee: number
          theme: string | null
          shoot_status: Database['public']['Enums']['shoot_status']
          frame_count: number | null
          storage_path: string | null
          storage_label: string | null
          storage_size_mb: number | null
          backup_location: string | null
          backed_up_at: string | null
          rating: number | null
          memo: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          session_id: string
          slot_no: number
          label?: string | null
          start_at: string
          planned_minutes?: number
          end_at?: string | null
          timer_status?: Database['public']['Enums']['timer_status']
          timer_started_at?: string | null
          timer_ends_at?: string | null
          timer_remaining_sec?: number | null
          timer_finished_at?: string | null
          extended_minutes?: number
          booking_fee?: number
          theme?: string | null
          shoot_status?: Database['public']['Enums']['shoot_status']
          frame_count?: number | null
          storage_path?: string | null
          storage_label?: string | null
          storage_size_mb?: number | null
          backup_location?: string | null
          backed_up_at?: string | null
          rating?: number | null
          memo?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          session_id?: string
          slot_no?: number
          label?: string | null
          start_at?: string
          planned_minutes?: number
          end_at?: string | null
          timer_status?: Database['public']['Enums']['timer_status']
          timer_started_at?: string | null
          timer_ends_at?: string | null
          timer_remaining_sec?: number | null
          timer_finished_at?: string | null
          extended_minutes?: number
          booking_fee?: number
          theme?: string | null
          shoot_status?: Database['public']['Enums']['shoot_status']
          frame_count?: number | null
          storage_path?: string | null
          storage_label?: string | null
          storage_size_mb?: number | null
          backup_location?: string | null
          backed_up_at?: string | null
          rating?: number | null
          memo?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'slots_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'sessions'
            referencedColumns: ['id']
          },
        ]
      }
      slot_models: {
        Row: {
          id: string
          user_id: string
          slot_id: string
          model_id: string
          costume: string | null
          fee: number
          extension_fee: number
          payment_status: Database['public']['Enums']['payment_status']
          paid_at: string | null
          payment_method: string | null
          delivery_status: Database['public']['Enums']['delivery_status']
          delivery_deadline: string | null
          delivered_at: string | null
          delivery_method: string | null
          delivery_url: string | null
          selected_count: number | null
          delivered_count: number | null
          memo: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          slot_id: string
          model_id: string
          costume?: string | null
          fee?: number
          extension_fee?: number
          payment_status?: Database['public']['Enums']['payment_status']
          paid_at?: string | null
          payment_method?: string | null
          delivery_status?: Database['public']['Enums']['delivery_status']
          delivery_deadline?: string | null
          delivered_at?: string | null
          delivery_method?: string | null
          delivery_url?: string | null
          selected_count?: number | null
          delivered_count?: number | null
          memo?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          slot_id?: string
          model_id?: string
          costume?: string | null
          fee?: number
          extension_fee?: number
          payment_status?: Database['public']['Enums']['payment_status']
          paid_at?: string | null
          payment_method?: string | null
          delivery_status?: Database['public']['Enums']['delivery_status']
          delivery_deadline?: string | null
          delivered_at?: string | null
          delivery_method?: string | null
          delivery_url?: string | null
          selected_count?: number | null
          delivered_count?: number | null
          memo?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'slot_models_slot_id_fkey'
            columns: ['slot_id']
            isOneToOne: false
            referencedRelation: 'slots'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'slot_models_model_id_fkey'
            columns: ['model_id']
            isOneToOne: false
            referencedRelation: 'models'
            referencedColumns: ['id']
          },
        ]
      }
      shoot_history: {
        Row: {
          id: string
          user_id: string
          shoot_date: string
          title: string
          shoot_type: Database['public']['Enums']['shoot_type']
          venue_id: string | null
          venue_name: string | null
          organizer_id: string | null
          organizer: string | null
          start_at: string | null
          end_at: string | null
          venue_cost: number
          transport_cost: number
          entry_cost: number
          other_cost: number
          frame_count: number | null
          storage_path: string | null
          storage_label: string | null
          storage_size_mb: number | null
          backup_location: string | null
          backed_up_at: string | null
          delivery_status: Database['public']['Enums']['delivery_status']
          delivered_at: string | null
          delivery_url: string | null
          rating: number | null
          memo: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          shoot_date: string
          title: string
          shoot_type?: Database['public']['Enums']['shoot_type']
          venue_id?: string | null
          venue_name?: string | null
          organizer_id?: string | null
          organizer?: string | null
          booking_opens_at?: string | null
          booking_method?: Database['public']['Enums']['booking_method'] | null
          booking_contact?: string | null
          concept?: string | null
          start_at?: string | null
          end_at?: string | null
          venue_cost?: number
          transport_cost?: number
          entry_cost?: number
          other_cost?: number
          frame_count?: number | null
          storage_path?: string | null
          storage_label?: string | null
          storage_size_mb?: number | null
          backup_location?: string | null
          backed_up_at?: string | null
          delivery_status?: Database['public']['Enums']['delivery_status']
          delivered_at?: string | null
          delivery_url?: string | null
          rating?: number | null
          memo?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          shoot_date?: string
          title?: string
          shoot_type?: Database['public']['Enums']['shoot_type']
          venue_id?: string | null
          venue_name?: string | null
          organizer_id?: string | null
          organizer?: string | null
          booking_opens_at?: string | null
          booking_method?: Database['public']['Enums']['booking_method'] | null
          booking_contact?: string | null
          concept?: string | null
          start_at?: string | null
          end_at?: string | null
          venue_cost?: number
          transport_cost?: number
          entry_cost?: number
          other_cost?: number
          frame_count?: number | null
          storage_path?: string | null
          storage_label?: string | null
          storage_size_mb?: number | null
          backup_location?: string | null
          backed_up_at?: string | null
          delivery_status?: Database['public']['Enums']['delivery_status']
          delivered_at?: string | null
          delivery_url?: string | null
          rating?: number | null
          memo?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'shoot_history_venue_id_fkey'
            columns: ['venue_id']
            isOneToOne: false
            referencedRelation: 'venues'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'shoot_history_organizer_id_fkey'
            columns: ['organizer_id']
            isOneToOne: false
            referencedRelation: 'organizers'
            referencedColumns: ['id']
          },
        ]
      }
      shoot_history_models: {
        Row: {
          id: string
          user_id: string
          shoot_history_id: string
          model_id: string
          costume: string | null
          fee: number
          payment_status: Database['public']['Enums']['payment_status']
          paid_at: string | null
          memo: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          shoot_history_id: string
          model_id: string
          costume?: string | null
          fee?: number
          payment_status?: Database['public']['Enums']['payment_status']
          paid_at?: string | null
          memo?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          shoot_history_id?: string
          model_id?: string
          costume?: string | null
          fee?: number
          payment_status?: Database['public']['Enums']['payment_status']
          paid_at?: string | null
          memo?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'shoot_history_models_shoot_history_id_fkey'
            columns: ['shoot_history_id']
            isOneToOne: false
            referencedRelation: 'shoot_history'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'shoot_history_models_model_id_fkey'
            columns: ['model_id']
            isOneToOne: false
            referencedRelation: 'models'
            referencedColumns: ['id']
          },
        ]
      }
      sync_tombstones: {
        Row: {
          id: number
          user_id: string
          table_name: string
          row_id: string
          deleted_at: string
        }
        Insert: {
          id?: never
          user_id: string
          table_name: string
          row_id: string
          deleted_at?: string
        }
        Update: {
          id?: never
          user_id?: string
          table_name?: string
          row_id?: string
          deleted_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_model_stats: {
        Row: {
          model_id: string | null
          user_id: string | null
          model_name: string | null
          shot_count: number | null
          session_count: number | null
          first_shot_date: string | null
          last_shot_date: string | null
          total_fee: number | null
          total_paid: number | null
          total_unpaid: number | null
        }
        Relationships: []
      }
      v_session_costs: {
        Row: {
          session_id: string | null
          user_id: string | null
          title: string | null
          session_date: string | null
          studio_cost: number | null
          transport_cost: number | null
          entry_cost: number | null
          other_cost: number | null
          booking_total: number | null
          model_total: number | null
          total_cost: number | null
        }
        Relationships: []
      }
      v_shoot_history_all: {
        Row: {
          source: string | null
          source_id: string | null
          user_id: string | null
          shoot_date: string | null
          title: string | null
          shoot_type: Database['public']['Enums']['shoot_type'] | null
          venue_id: string | null
          venue_name: string | null
          organizer_id: string | null
          organizer: string | null
          start_at: string | null
          end_at: string | null
          frame_count: number | null
          storage_path: string | null
          storage_label: string | null
          storage_size_mb: number | null
          backup_location: string | null
          backed_up_at: string | null
          rating: number | null
          memo: string | null
          session_id: string | null
          slot_no: number | null
        }
        Relationships: []
      }
      v_pending_deliveries: {
        Row: {
          slot_model_id: string | null
          user_id: string | null
          session_id: string | null
          session_title: string | null
          session_date: string | null
          slot_id: string | null
          slot_no: number | null
          slot_label: string | null
          start_at: string | null
          storage_path: string | null
          model_id: string | null
          model_name: string | null
          model_avatar_url: string | null
          delivery_status: Database['public']['Enums']['delivery_status'] | null
          delivery_deadline: string | null
          delivery_method: string | null
          delivery_url: string | null
          selected_count: number | null
          delivered_count: number | null
          days_overdue: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      purge_sync_tombstones: {
        Args: { p_retention?: unknown }
        Returns: number
      }
    }
    Enums: {
      model_status: 'active' | 'inactive' | 'ng'
      venue_kind: 'studio' | 'location'
      booking_method: 'page' | 'email' | 'dm'
      shoot_type: 'solo' | 'event' | 'client' | 'personal'
      session_status: 'planned' | 'confirmed' | 'done' | 'cancelled'
      timer_status: 'idle' | 'running' | 'paused' | 'finished'
      shoot_status: 'planned' | 'shot' | 'cancelled' | 'no_show'
      payment_status: 'unpaid' | 'paid'
      delivery_status: 'not_started' | 'selecting' | 'retouching' | 'delivered'
    }
    CompositeTypes: Record<never, never>
  }
}

type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']
export type Views<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row']
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]
