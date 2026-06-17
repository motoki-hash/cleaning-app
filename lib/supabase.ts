import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      facilities: {
        Row: {
          id: string;
          name: string;
          address: string | null;
          contact_phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          address?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      rooms: {
        Row: {
          id: string;
          facility_id: string;
          room_number: string;
          room_type: string | null;
          floor: number | null;
          status: 'available' | 'cleaning' | 'maintenance';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          facility_id: string;
          room_number: string;
          room_type?: string | null;
          floor?: number | null;
          status?: 'available' | 'cleaning' | 'maintenance';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          facility_id?: string;
          room_number?: string;
          room_type?: string | null;
          floor?: number | null;
          status?: 'available' | 'cleaning' | 'maintenance';
          created_at?: string;
          updated_at?: string;
        };
      };
      cleaning_companies: {
        Row: {
          id: string;
          name: string;
          contact_person: string | null;
          phone: string | null;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          contact_person?: string | null;
          phone?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          contact_person?: string | null;
          phone?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      cleaners: {
        Row: {
          id: string;
          company_id: string;
          user_id: string | null;
          name: string;
          phone: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id?: string | null;
          name: string;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          user_id?: string | null;
          name?: string;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      cleaning_records: {
        Row: {
          id: string;
          room_id: string;
          cleaner_id: string;
          scheduled_date: string;
          started_at: string | null;
          completed_at: string | null;
          status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          cleaner_id: string;
          scheduled_date: string;
          started_at?: string | null;
          completed_at?: string | null;
          status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          cleaner_id?: string;
          scheduled_date?: string;
          started_at?: string | null;
          completed_at?: string | null;
          status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      cleaning_photos: {
        Row: {
          id: string;
          cleaning_record_id: string;
          photo_url: string;
          photo_type: 'before' | 'after' | 'issue' | null;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cleaning_record_id: string;
          photo_url: string;
          photo_type?: 'before' | 'after' | 'issue' | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cleaning_record_id?: string;
          photo_url?: string;
          photo_type?: 'before' | 'after' | 'issue' | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      trouble_reports: {
        Row: {
          id: string;
          room_id: string;
          cleaning_record_id: string | null;
          reporter_id: string | null;
          title: string;
          description: string;
          priority: 'low' | 'medium' | 'high' | 'urgent';
          status: 'open' | 'in_progress' | 'resolved' | 'closed';
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          cleaning_record_id?: string | null;
          reporter_id?: string | null;
          title: string;
          description: string;
          priority?: 'low' | 'medium' | 'high' | 'urgent';
          status?: 'open' | 'in_progress' | 'resolved' | 'closed';
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          cleaning_record_id?: string | null;
          reporter_id?: string | null;
          title?: string;
          description?: string;
          priority?: 'low' | 'medium' | 'high' | 'urgent';
          status?: 'open' | 'in_progress' | 'resolved' | 'closed';
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};
