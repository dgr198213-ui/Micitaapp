// Hand-written to match supabase/migrations/*.sql. Regenerate against a real Supabase
// project once one exists:
//   supabase gen types typescript --project-id <ref> > src/modules/shared/database.types.ts
// (This session's Docker registry access is policy-blocked, so `--db-url` against a local
// stack wasn't available either — see README "Local development" for the workaround used.)

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Relationships = never[];

export interface Database {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string;
          slug: string;
          name: string;
          timezone: string;
          booking_policy: Json;
          active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["businesses"]["Row"]> & { slug: string; name: string };
        Update: Partial<Database["public"]["Tables"]["businesses"]["Row"]>;
        Relationships: Relationships;
      };
      business_hours: {
        Row: { id: string; business_id: string; weekday: number; start_local: string; end_local: string };
        Insert: Partial<Database["public"]["Tables"]["business_hours"]["Row"]> & {
          business_id: string; weekday: number; start_local: string; end_local: string;
        };
        Update: Partial<Database["public"]["Tables"]["business_hours"]["Row"]>;
        Relationships: Relationships;
      };
      memberships: {
        Row: { id: string; business_id: string; user_id: string; role: "owner" | "staff" | "platform_admin"; staff_id: string | null; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["memberships"]["Row"]> & { business_id: string; user_id: string; role: string };
        Update: Partial<Database["public"]["Tables"]["memberships"]["Row"]>;
        Relationships: Relationships;
      };
      staff: {
        Row: { id: string; business_id: string; display_name: string; active: boolean; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["staff"]["Row"]> & { business_id: string; display_name: string };
        Update: Partial<Database["public"]["Tables"]["staff"]["Row"]>;
        Relationships: Relationships;
      };
      services: {
        Row: {
          id: string; business_id: string; name: string; duration_minutes: number;
          buffer_after_minutes: number; price_cents: number; active: boolean; created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["services"]["Row"]> & { business_id: string; name: string; duration_minutes: number };
        Update: Partial<Database["public"]["Tables"]["services"]["Row"]>;
        Relationships: Relationships;
      };
      staff_services: {
        Row: { business_id: string; staff_id: string; service_id: string };
        Insert: Database["public"]["Tables"]["staff_services"]["Row"];
        Update: Partial<Database["public"]["Tables"]["staff_services"]["Row"]>;
        Relationships: Relationships;
      };
      working_hours: {
        Row: { id: string; business_id: string; staff_id: string; weekday: number; start_local: string; end_local: string };
        Insert: Partial<Database["public"]["Tables"]["working_hours"]["Row"]> & {
          business_id: string; staff_id: string; weekday: number; start_local: string; end_local: string;
        };
        Update: Partial<Database["public"]["Tables"]["working_hours"]["Row"]>;
        Relationships: Relationships;
      };
      time_off: {
        Row: { id: string; business_id: string; staff_id: string; starts_at: string; ends_at: string; reason: string | null; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["time_off"]["Row"]> & {
          business_id: string; staff_id: string; starts_at: string; ends_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["time_off"]["Row"]>;
        Relationships: Relationships;
      };
      customers: {
        Row: {
          id: string; business_id: string; name: string; email: string | null; phone: string | null;
          notes: string | null; marketing_consent: boolean; deleted_at: string | null; created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["customers"]["Row"]> & { business_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["customers"]["Row"]>;
        Relationships: Relationships;
      };
      appointments: {
        Row: {
          id: string; business_id: string; staff_id: string; service_id: string; customer_id: string;
          starts_at: string; ends_at: string; status: string; access_token_hash: string | null;
          price_cents: number; duration_minutes: number; buffer_after_minutes: number; notes: string | null;
          created_by: string; created_at: string; updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["appointments"]["Row"]> & {
          business_id: string; staff_id: string; service_id: string; customer_id: string;
          starts_at: string; ends_at: string; duration_minutes: number;
        };
        Update: Partial<Database["public"]["Tables"]["appointments"]["Row"]>;
        Relationships: Relationships;
      };
      appointment_events: {
        Row: {
          id: string; appointment_id: string; business_id: string; event: string; actor: string;
          actor_user_id: string | null; metadata: Json; created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["appointment_events"]["Row"]> & {
          appointment_id: string; business_id: string; event: string; actor: string;
        };
        Update: Partial<Database["public"]["Tables"]["appointment_events"]["Row"]>;
        Relationships: Relationships;
      };
      notification_jobs: {
        Row: {
          id: string; business_id: string; appointment_id: string | null; channel: string; template: string;
          payload: Json; scheduled_for: string; status: string; attempts: number; last_error: string | null;
          idempotency_key: string; sent_at: string | null; claimed_at: string | null; created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notification_jobs"]["Row"]> & {
          business_id: string; channel: string; template: string; payload: Json; scheduled_for: string; idempotency_key: string;
        };
        Update: Partial<Database["public"]["Tables"]["notification_jobs"]["Row"]>;
        Relationships: Relationships;
      };
      idempotency_keys: {
        Row: {
          business_id: string; scope: string; key: string; request_hash: string;
          response_status: number; response_body: Json; created_at: string;
        };
        Insert: Database["public"]["Tables"]["idempotency_keys"]["Row"];
        Update: Partial<Database["public"]["Tables"]["idempotency_keys"]["Row"]>;
        Relationships: Relationships;
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_available_slots: {
        Args: {
          p_business_id: string;
          p_service_id: string;
          p_staff_id?: string | null;
          p_from?: string;
          p_to?: string;
        };
        Returns: { staff_id: string; starts_at: string; ends_at: string }[];
      };
      is_slot_bookable: {
        Args: {
          p_business_id: string;
          p_staff_id: string;
          p_service_id: string;
          p_starts_at: string;
          p_exclude_appointment_id?: string | null;
        };
        Returns: boolean;
      };
      create_public_booking: {
        Args: {
          p_business_slug: string;
          p_service_id: string;
          p_staff_id: string | null;
          p_starts_at: string;
          p_customer_name: string;
          p_customer_email: string | null;
          p_customer_phone: string | null;
          p_notes: string | null;
          p_marketing_consent: boolean | null;
          p_idempotency_key: string | null;
          p_request_hash: string | null;
        };
        Returns: {
          appointment_id: string; status: string; starts_at: string; ends_at: string;
          manage_token: string | null; price_cents: number;
        }[];
      };
      get_appointment_by_token: {
        Args: { p_token: string };
        Returns: {
          appointment_id: string; status: string; starts_at: string; ends_at: string;
          service_name: string; staff_name: string; business_name: string;
          business_timezone: string; price_cents: number;
        }[];
      };
      cancel_appointment_by_token: {
        Args: { p_token: string };
        Returns: { appointment_id: string; status: string }[];
      };
      reschedule_appointment_by_token: {
        Args: { p_token: string; p_new_starts_at: string };
        Returns: { appointment_id: string; status: string; starts_at: string; ends_at: string }[];
      };
      claim_notification_jobs: {
        Args: { p_limit?: number };
        Returns: Database["public"]["Tables"]["notification_jobs"]["Row"][];
      };
      mark_notification_sent: {
        Args: { p_id: string };
        Returns: undefined;
      };
      mark_notification_failed: {
        Args: { p_id: string; p_error: string };
        Returns: undefined;
      };
      auth_business_role: {
        Args: { p_business_id: string };
        Returns: string | null;
      };
      auth_staff_id: {
        Args: { p_business_id: string };
        Returns: string | null;
      };
      auth_is_platform_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      purge_expired_artifacts: {
        Args: Record<string, never>;
        Returns: Json;
      };
      expire_pending_appointments: {
        Args: Record<string, never>;
        Returns: number;
      };
      auto_complete_stale_appointments: {
        Args: Record<string, never>;
        Returns: number;
      };
      close_appointment_manually: {
        Args: { p_appointment_id: string; p_status: "completed" | "no_show" };
        Returns: Database["public"]["Tables"]["appointments"]["Row"][];
      };
      log_appointment_event: {
        Args: { p_appointment_id: string; p_event: string; p_metadata?: Json };
        Returns: Database["public"]["Tables"]["appointment_events"]["Row"];
      };
    };
    Enums: Record<string, never>;
  };
}
