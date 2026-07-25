export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AccessDecision = 'granted' | 'denied';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          role: string;
          face_embedding: number[] | null;
          camera_status?: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          role: string;
          face_embedding?: number[] | null;
          camera_status?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          role?: string;
          face_embedding?: number[] | null;
          camera_status?: string | null;
        };
        Relationships: [];
      };
      laboratories: {
        Row: {
          id: string;
          name: string;
          location: string | null;
          pi_status: Record<string, unknown> | null;
          mode: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          location?: string | null;
          pi_status?: Record<string, unknown> | null;
          mode?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          location?: string | null;
          pi_status?: Record<string, unknown> | null;
          mode?: string | null;
        };
        Relationships: [];
      };
      schedules: {
        Row: {
          id: string;
          faculty_id: string;
          laboratory_id: string;
          /** One of Monday | Tuesday | Wednesday | Thursday | Friday | Saturday | Sunday */
          day_of_week: string;
          /** Time-of-day string from the DB: "HH:MM:SS" */
          start_time: string;
          /** Time-of-day string from the DB: "HH:MM:SS" */
          end_time: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          faculty_id: string;
          laboratory_id: string;
          day_of_week: string;
          start_time: string;
          end_time: string;
          created_at?: string;
        };
        Update: {
          faculty_id?: string;
          laboratory_id?: string;
          day_of_week?: string;
          start_time?: string;
          end_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'schedules_faculty_id_fkey';
            columns: ['faculty_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'schedules_laboratory_id_fkey';
            columns: ['laboratory_id'];
            isOneToOne: false;
            referencedRelation: 'laboratories';
            referencedColumns: ['id'];
          },
        ];
      };
      admins: {
        Row: {
          id: string;
          username: string;
          password: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          username: string;
          password: string;
          created_at?: string;
        };
        Update: {
          username?: string;
          password?: string;
        };
        Relationships: [];
      };
      access_logs: {
        Row: {
          id: string;
          faculty_id: string | null;
          laboratory_id: string | null;
          decision: AccessDecision;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          faculty_id?: string | null;
          laboratory_id?: string | null;
          decision: AccessDecision;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          faculty_id?: string | null;
          laboratory_id?: string | null;
          decision?: AccessDecision;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'access_logs_faculty_id_fkey';
            columns: ['faculty_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'access_logs_laboratory_id_fkey';
            columns: ['laboratory_id'];
            isOneToOne: false;
            referencedRelation: 'laboratories';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      generate_face_embedding: {
        Args: { image_base64: string };
        Returns: number[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Laboratory = Database['public']['Tables']['laboratories']['Row'];
export type Schedule = Database['public']['Tables']['schedules']['Row'];
export type AccessLog = Database['public']['Tables']['access_logs']['Row'];

export type ScheduleWithRelations = Schedule & {
  profiles?: Pick<Profile, 'id' | 'name' | 'role'> | null;
  laboratories?: Pick<Laboratory, 'id' | 'name' | 'location'> | null;
};

export type AccessLogWithRelations = AccessLog & {
  profiles?: Pick<Profile, 'id' | 'name' | 'role'> | null;
  laboratories?: Pick<Laboratory, 'id' | 'name' | 'location'> | null;
};
