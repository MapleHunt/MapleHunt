export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      assistant_queries: {
        Row: {
          answer: string | null
          cited_chunk_ids: number[] | null
          created_at: string
          id: string
          question: string
          user_id: string
        }
        Insert: {
          answer?: string | null
          cited_chunk_ids?: number[] | null
          created_at?: string
          id?: string
          question: string
          user_id: string
        }
        Update: {
          answer?: string | null
          cited_chunk_ids?: number[] | null
          created_at?: string
          id?: string
          question?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_queries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      harvest_records: {
        Row: {
          age_class: Database["public"]["Enums"]["age_class_t"]
          deleted_at: string | null
          harvested_at: string
          hunt_day_id: string | null
          id: string
          location: unknown
          method: Database["public"]["Enums"]["method_t"]
          photo_path: string | null
          server_updated_at: string
          sex: Database["public"]["Enums"]["sex_t"]
          species: Database["public"]["Enums"]["species_t"]
          tag_number: string | null
          updated_at: string
          user_id: string
          wmu_code: string | null
        }
        Insert: {
          age_class: Database["public"]["Enums"]["age_class_t"]
          deleted_at?: string | null
          harvested_at: string
          hunt_day_id?: string | null
          id: string
          location?: unknown
          method: Database["public"]["Enums"]["method_t"]
          photo_path?: string | null
          server_updated_at?: string
          sex: Database["public"]["Enums"]["sex_t"]
          species: Database["public"]["Enums"]["species_t"]
          tag_number?: string | null
          updated_at?: string
          user_id: string
          wmu_code?: string | null
        }
        Update: {
          age_class?: Database["public"]["Enums"]["age_class_t"]
          deleted_at?: string | null
          harvested_at?: string
          hunt_day_id?: string | null
          id?: string
          location?: unknown
          method?: Database["public"]["Enums"]["method_t"]
          photo_path?: string | null
          server_updated_at?: string
          sex?: Database["public"]["Enums"]["sex_t"]
          species?: Database["public"]["Enums"]["species_t"]
          tag_number?: string | null
          updated_at?: string
          user_id?: string
          wmu_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "harvest_records_hunt_day_id_fkey"
            columns: ["hunt_day_id"]
            isOneToOne: false
            referencedRelation: "hunt_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_records_wmu_code_fkey"
            columns: ["wmu_code"]
            isOneToOne: false
            referencedRelation: "wmu_boundaries"
            referencedColumns: ["wmu_code"]
          },
        ]
      }
      hunt_days: {
        Row: {
          deleted_at: string | null
          hours: number | null
          hunt_date: string
          id: string
          party_id: string | null
          server_updated_at: string
          species: Database["public"]["Enums"]["species_t"]
          updated_at: string
          user_id: string
          wmu_code: string | null
        }
        Insert: {
          deleted_at?: string | null
          hours?: number | null
          hunt_date: string
          id: string
          party_id?: string | null
          server_updated_at?: string
          species: Database["public"]["Enums"]["species_t"]
          updated_at?: string
          user_id: string
          wmu_code?: string | null
        }
        Update: {
          deleted_at?: string | null
          hours?: number | null
          hunt_date?: string
          id?: string
          party_id?: string | null
          server_updated_at?: string
          species?: Database["public"]["Enums"]["species_t"]
          updated_at?: string
          user_id?: string
          wmu_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hunt_days_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunt_days_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunt_days_wmu_code_fkey"
            columns: ["wmu_code"]
            isOneToOne: false
            referencedRelation: "wmu_boundaries"
            referencedColumns: ["wmu_code"]
          },
        ]
      }
      land_areas: {
        Row: {
          category: string
          geom: unknown
          hunting_status: string
          id: number
          name: string | null
          source: string | null
        }
        Insert: {
          category: string
          geom: unknown
          hunting_status?: string
          id?: number
          name?: string | null
          source?: string | null
        }
        Update: {
          category?: string
          geom?: unknown
          hunting_status?: string
          id?: number
          name?: string | null
          source?: string | null
        }
        Relationships: []
      }
      observations: {
        Row: {
          age_class: string | null
          count: number
          deleted_at: string | null
          hunt_day_id: string
          id: string
          location: unknown
          server_updated_at: string
          sex: string | null
          species: string
          updated_at: string
          user_id: string
        }
        Insert: {
          age_class?: string | null
          count?: number
          deleted_at?: string | null
          hunt_day_id: string
          id: string
          location?: unknown
          server_updated_at?: string
          sex?: string | null
          species: string
          updated_at?: string
          user_id: string
        }
        Update: {
          age_class?: string | null
          count?: number
          deleted_at?: string | null
          hunt_day_id?: string
          id?: string
          location?: unknown
          server_updated_at?: string
          sex?: string | null
          species?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "observations_hunt_day_id_fkey"
            columns: ["hunt_day_id"]
            isOneToOne: false
            referencedRelation: "hunt_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          created_at: string
          id: string
          mesh_channel: string | null
          name: string
          season_year: number
          species: Database["public"]["Enums"]["species_t"]
          tag_holder_id: string
          wmu_code: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mesh_channel?: string | null
          name: string
          season_year: number
          species: Database["public"]["Enums"]["species_t"]
          tag_holder_id: string
          wmu_code?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mesh_channel?: string | null
          name?: string
          season_year?: number
          species?: Database["public"]["Enums"]["species_t"]
          tag_holder_id?: string
          wmu_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parties_tag_holder_id_fkey"
            columns: ["tag_holder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parties_wmu_code_fkey"
            columns: ["wmu_code"]
            isOneToOne: false
            referencedRelation: "wmu_boundaries"
            referencedColumns: ["wmu_code"]
          },
        ]
      }
      party_members: {
        Row: {
          joined_at: string
          mesh_node_id: string | null
          party_id: string
          profile_id: string
          role: string
        }
        Insert: {
          joined_at?: string
          mesh_node_id?: string | null
          party_id: string
          profile_id: string
          role?: string
        }
        Update: {
          joined_at?: string
          mesh_node_id?: string | null
          party_id?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_members_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_positions: {
        Row: {
          id: number
          location: unknown
          mesh_node_id: string
          party_id: string
          reported_at: string
          via: string
        }
        Insert: {
          id?: number
          location: unknown
          mesh_node_id: string
          party_id: string
          reported_at: string
          via: string
        }
        Update: {
          id?: number
          location?: unknown
          mesh_node_id?: string
          party_id?: string
          reported_at?: string
          via?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_positions_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          home_wmu: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          home_wmu?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          home_wmu?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_home_wmu_fkey"
            columns: ["home_wmu"]
            isOneToOne: false
            referencedRelation: "wmu_boundaries"
            referencedColumns: ["wmu_code"]
          },
        ]
      }
      reg_chunks: {
        Row: {
          body: string
          id: number
          page: number | null
          season_year: number
          section: string | null
          source_url: string | null
          tsv: unknown
        }
        Insert: {
          body: string
          id?: number
          page?: number | null
          season_year: number
          section?: string | null
          source_url?: string | null
          tsv?: unknown
        }
        Update: {
          body?: string
          id?: number
          page?: number | null
          season_year?: number
          section?: string | null
          source_url?: string | null
          tsv?: unknown
        }
        Relationships: []
      }
      wmu_boundaries: {
        Row: {
          geom: unknown
          imported_at: string
          name: string | null
          source: string | null
          wmu_code: string
        }
        Insert: {
          geom: unknown
          imported_at?: string
          name?: string | null
          source?: string | null
          wmu_code: string
        }
        Update: {
          geom?: unknown
          imported_at?: string
          name?: string | null
          source?: string | null
          wmu_code?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_party_member: { Args: { p_party: string }; Returns: boolean }
      shares_party_with: { Args: { p_profile: string }; Returns: boolean }
      sync_pull: { Args: { since?: string }; Returns: Json }
      sync_push: { Args: { payload: Json }; Returns: Json }
    }
    Enums: {
      age_class_t: "adult" | "yearling" | "young"
      method_t: "gun" | "bow" | "muzzleloader"
      sex_t: "male" | "female"
      species_t:
        | "deer"
        | "moose"
        | "bear"
        | "elk"
        | "wild_turkey"
        | "wolf_coyote"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      age_class_t: ["adult", "yearling", "young"],
      method_t: ["gun", "bow", "muzzleloader"],
      sex_t: ["male", "female"],
      species_t: ["deer", "moose", "bear", "elk", "wild_turkey", "wolf_coyote"],
    },
  },
} as const
