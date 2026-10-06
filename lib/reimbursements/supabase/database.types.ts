export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      academic_years: {
        Row: {
          id: string;
          label: string;
          starts_on: string;
          ends_on: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          label: string;
          starts_on: string;
          ends_on: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          label?: string;
          starts_on?: string;
          ends_on?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      academic_terms: {
        Row: {
          id: string;
          cycle_id: string;
          season: "fall" | "spring";
          label: string;
          starts_on: string;
          ends_on: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          season: "fall" | "spring";
          label: string;
          starts_on: string;
          ends_on: string;
          created_at?: string;
        };
        Update: {
          cycle_id?: string;
          season?: "fall" | "spring";
          label?: string;
          starts_on?: string;
          ends_on?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accreditation_terms_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
        ];
      };
      venue_inquiries: {
        Row: {
          id: string;
          contact_name: string;
          email: string;
          organization: string;
          event_type: string;
          event_date: string | null;
          guest_count: number | null;
          details: string;
          source_hash: string;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          contact_name: string;
          email: string;
          organization: string;
          event_type: string;
          event_date?: string | null;
          guest_count?: number | null;
          details: string;
          source_hash: string;
          submitted_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      reimbursement_budgets: {
        Row: {
          id: boolean;
          category_amounts: Json;
          original_category_amounts: Json;
          completed_categories: Database["public"]["Enums"]["reimbursement_category"][];
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          category_amounts?: Json;
          original_category_amounts?: Json;
          completed_categories?: Database["public"]["Enums"]["reimbursement_category"][];
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          category_amounts?: Json;
          original_category_amounts?: Json;
          completed_categories?: Database["public"]["Enums"]["reimbursement_category"][];
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      reimbursement_budget_entries: {
        Row: {
          kind: "income" | "forecast";
          id: string;
          amount: number;
          description: string;
          source: Database["public"]["Enums"]["chapter_income_source"];
          budget_date: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          kind?: "income" | "forecast";
          id?: string;
          amount: number;
          description: string;
          source?: Database["public"]["Enums"]["chapter_income_source"];
          budget_date: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          kind?: "income" | "forecast";
          amount?: number;
          description?: string;
          source?: Database["public"]["Enums"]["chapter_income_source"];
          budget_date?: string;
          created_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      chapter_financial_settings: {
        Row: {
          id: boolean;
          chapter_name: string;
          academic_term_id: string;
          term_label: string;
          term_start: string;
          term_end: string;
          opening_cash: number;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          chapter_name?: string;
          academic_term_id: string;
          term_label: string;
          term_start: string;
          term_end: string;
          opening_cash?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          chapter_name?: string;
          academic_term_id?: string;
          term_label?: string;
          term_start?: string;
          term_end?: string;
          opening_cash?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chapter_financial_settings_academic_term_id_fkey";
            columns: ["academic_term_id"];
            isOneToOne: false;
            referencedRelation: "academic_terms";
            referencedColumns: ["id"];
          },
        ];
      };
      hosting_finance_orders: {
        Row: {
          order_id: string;
          organization: string;
          event_date: string;
          planned_revenue: number;
          planned_fire_permit: number;
          status: Database["public"]["Enums"]["hosting_finance_status"];
          confirmed_by: string | null;
          confirmed_at: string;
          cancelled_at: string | null;
          updated_at: string;
        };
        Insert: {
          order_id: string;
          organization: string;
          event_date: string;
          planned_revenue: number;
          planned_fire_permit: number;
          status?: Database["public"]["Enums"]["hosting_finance_status"];
          confirmed_by?: string | null;
          confirmed_at?: string;
          cancelled_at?: string | null;
          updated_at?: string;
        };
        // Term fields are only writable on a cancelled → confirmed
        // transition (re-confirmation refreshes them from the order); the
        // hosting_finance_orders_guard trigger rejects term edits otherwise.
        Update: {
          status?: Database["public"]["Enums"]["hosting_finance_status"];
          cancelled_at?: string | null;
          organization?: string;
          event_date?: string;
          planned_revenue?: number;
          planned_fire_permit?: number;
          confirmed_by?: string | null;
          confirmed_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      hosting_finance_payments: {
        Row: {
          id: string;
          order_id: string;
          kind: Database["public"]["Enums"]["hosting_payment_kind"];
          amount: number;
          paid_date: string;
          request_id: string;
          recorded_by: string | null;
          created_at: string;
          reversed_at: string | null;
          reversed_by: string | null;
          reversal_reason: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          kind: Database["public"]["Enums"]["hosting_payment_kind"];
          amount: number;
          paid_date: string;
          request_id: string;
          recorded_by?: string | null;
          created_at?: string;
          reversed_at?: string | null;
          reversed_by?: string | null;
          reversal_reason?: string | null;
        };
        Update: {
          reversed_at?: string | null;
          reversed_by?: string | null;
          reversal_reason?: string | null;
        };
        Relationships: [];
      };
      chapter_dues_payment_events: {
        Row: {
          id: string;
          receivable_id: string;
          amount: number;
          paid_date: string;
          date_is_estimated: boolean;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      chapter_receivable_notes: {
        Row: {
          id: string;
          receivable_id: string;
          body: string;
          created_by: string | null;
          author_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          receivable_id: string;
          body: string;
          created_by?: string | null;
          author_name: string;
          created_at?: string;
        };
        Update: {
          body?: string;
        };
        Relationships: [];
      };
      chapter_receivables: {
        Row: {
          payment_plan_frequency: string | null;
          payment_plan_amount: number | null;
          payment_plan_interval_days: number | null;
          member_id: string | null;
          id: string;
          member_name: string;
          amount_assessed: number;
          amount_paid: number;
          waived_at: string | null;
          waived_by: string | null;
          due_date: string;
          discord_user_id: string;
          notes: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          payment_plan_frequency?: string | null;
          payment_plan_amount?: number | null;
          payment_plan_interval_days?: number | null;
          member_id?: string | null;
          id?: string;
          member_name: string;
          amount_assessed: number;
          amount_paid?: number;
          waived_at?: string | null;
          waived_by?: string | null;
          due_date: string;
          discord_user_id?: string;
          notes?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          payment_plan_frequency?: string | null;
          payment_plan_amount?: number | null;
          payment_plan_interval_days?: number | null;
          member_id?: string | null;
          member_name?: string;
          amount_assessed?: number;
          amount_paid?: number;
          waived_at?: string | null;
          waived_by?: string | null;
          due_date?: string;
          discord_user_id?: string;
          notes?: string;
          created_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      reimbursement_manual_expenses: {
        Row: {
          receipt_path: string | null;
          id: string;
          category: Database["public"]["Enums"]["reimbursement_category"];
          amount: number;
          description: string;
          expense_date: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          receipt_path?: string | null;
          id?: string;
          category: Database["public"]["Enums"]["reimbursement_category"];
          amount: number;
          description: string;
          expense_date: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          receipt_path?: string | null;
          category?: Database["public"]["Enums"]["reimbursement_category"];
          amount?: number;
          description?: string;
          expense_date?: string;
          created_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          role: Database["public"]["Enums"]["app_role"];
          removed_at: string | null;
          has_signed_in: boolean;
          discord_user_id: string;
          member_since_term_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          email?: string;
          role?: Database["public"]["Enums"]["app_role"];
          removed_at?: string | null;
          has_signed_in?: boolean;
          discord_user_id?: string;
          member_since_term_id?: string | null;
          created_at?: string;
        };
        Update: {
          full_name?: string;
          email?: string;
          role?: Database["public"]["Enums"]["app_role"];
          removed_at?: string | null;
          has_signed_in?: boolean;
          discord_user_id?: string;
          member_since_term_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_member_since_term_id_fkey";
            columns: ["member_since_term_id"];
            isOneToOne: false;
            referencedRelation: "academic_terms";
            referencedColumns: ["id"];
          },
        ];
      };
      mcp_audit_log: {
        Row: {
          id: number;
          user_id: string;
          client_id: string;
          tool_name: string;
          request_id: string | null;
          target_id: string | null;
          details: Json;
          called_at: string;
        };
        Insert: {
          id?: never;
          user_id: string;
          client_id: string;
          tool_name: string;
          request_id?: string | null;
          target_id?: string | null;
          details?: Json;
          called_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      invites: {
        Row: {
          email: string;
          role: Database["public"]["Enums"]["app_role"];
          invited_by: string | null;
          created_at: string;
        };
        Insert: {
          email: string;
          role?: Database["public"]["Enums"]["app_role"];
          invited_by?: string | null;
          created_at?: string;
        };
        Update: {
          email?: string;
          role?: Database["public"]["Enums"]["app_role"];
          invited_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      reimbursements: {
        Row: {
          id: string;
          user_id: string | null;
          full_name: string;
          category: Database["public"]["Enums"]["reimbursement_category"];
          amount: number;
          description: string;
          payment_method: string;
          receipt_path: string;
          status: Database["public"]["Enums"]["reimbursement_status"];
          merchant: string | null;
          receipt_date: string | null;
          receipt_total: number | null;
          failure_reason: string | null;
          denial_reason: string | null;
          reimbursed: boolean;
          reimbursed_at: string | null;
          reimbursement_date_is_estimated: boolean;
          discord_message_id: string | null;
          discord_channel_id: string | null;
          discord_notified_at: string | null;
          discord_decided_at: string | null;
          discord_reviewer_id: string | null;
          submitted_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          full_name: string;
          category: Database["public"]["Enums"]["reimbursement_category"];
          amount: number;
          description: string;
          payment_method: string;
          receipt_path: string;
          status?: Database["public"]["Enums"]["reimbursement_status"];
          merchant?: string | null;
          receipt_date?: string | null;
          receipt_total?: number | null;
          failure_reason?: string | null;
          denial_reason?: string | null;
          reimbursed?: boolean;
          reimbursed_at?: string | null;
          reimbursement_date_is_estimated?: boolean;
          discord_message_id?: string | null;
          discord_channel_id?: string | null;
          discord_notified_at?: string | null;
          discord_decided_at?: string | null;
          discord_reviewer_id?: string | null;
          submitted_at?: string;
          updated_at?: string;
        };
        Update: {
          category?: Database["public"]["Enums"]["reimbursement_category"];
          status?: Database["public"]["Enums"]["reimbursement_status"];
          merchant?: string | null;
          receipt_date?: string | null;
          receipt_total?: number | null;
          failure_reason?: string | null;
          denial_reason?: string | null;
          reimbursed?: boolean;
          reimbursed_at?: string | null;
          reimbursement_date_is_estimated?: boolean;
          discord_message_id?: string | null;
          discord_channel_id?: string | null;
          discord_notified_at?: string | null;
          discord_decided_at?: string | null;
          discord_reviewer_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      mcp_create_reimbursement: {
        Args: {
          p_member_id: string;
          p_category: Database["public"]["Enums"]["reimbursement_category"];
          p_amount: number;
          p_description: string;
          p_payment_method: string;
          p_receipt_path: string;
          p_paid: boolean;
          p_request_id: string;
        };
        Returns: Json;
      };
      admin_invite_email: {
        Args: {
          invite_email: string;
          invite_role: "none" | "member" | "admin";
          invite_member_since_term_id?: string | null;
        };
        Returns: undefined;
      };
      admin_remove_profile: {
        Args: { target_user_id: string };
        Returns: undefined;
      };
      admin_set_pending_profile_name: {
        Args: { new_full_name: string; target_user_id: string };
        Returns: undefined;
      };
      admin_set_profile_discord_id: {
        Args: { new_discord_user_id: string; target_user_id: string };
        Returns: undefined;
      };
      admin_set_profile_academic_term: {
        Args: { new_academic_term_id: string | null; target_user_id: string };
        Returns: undefined;
      };
      admin_set_profile_role: {
        Args: { new_role: "none" | "member" | "admin"; target_user_id: string };
        Returns: undefined;
      };
      bulk_update_receivables: {
        Args: {
          p_rows: Json;
          p_due_date: string | null;
          p_amount_assessed: number | null;
          p_notes: string;
          p_apply_due_date: boolean;
          p_apply_amount: boolean;
          p_apply_notes: boolean;
        };
        Returns: boolean;
      };
      bulk_change_receivable_state: {
        Args: { p_rows: Json; p_action: string; p_payment_date: string };
        Returns: boolean;
      };
      claim_pending_invite: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      mcp_budget_categories: { Args: Record<PropertyKey, never>; Returns: Json };
      mcp_admin_read: { Args: { p_resource: string }; Returns: Json };
      mcp_admin_write: {
        Args: {
          p_action: string;
          p_payload: Json;
          p_request_id?: string;
          p_confirmed?: boolean;
        };
        Returns: Json;
      };
      mcp_begin_external: {
        Args: { p_action: string; p_payload: Json; p_request_id: string; p_confirmed: boolean };
        Returns: Json;
      };
      mcp_finish_external: {
        Args: { p_request_id: string; p_succeeded: boolean; p_result?: Json };
        Returns: Json;
      };
      mcp_finance_overview: { Args: Record<PropertyKey, never>; Returns: Json };
      mcp_open_dues: { Args: Record<PropertyKey, never>; Returns: Json };
      record_dues_payment: {
        Args: { p_payment_amount: number; p_payment_date: string; p_receivable_id: string; p_request_id: string };
        Returns: boolean;
      };
      set_receivable_payment_plan: {
        Args: {
          p_id: string;
          p_updated_at: string;
          p_frequency: string | null;
          p_amount: number | null;
          p_interval_days: number | null;
        };
        Returns: boolean;
      };
      add_receivable_note: {
        Args: { p_receivable_id: string; p_body: string; p_request_id: string };
        Returns: string;
      };
      record_hosting_payment: {
        Args: { p_amount: number; p_kind: Database["public"]["Enums"]["hosting_payment_kind"]; p_order_id: string; p_paid_date: string; p_request_id: string };
        Returns: string;
      };
      set_dues_paid_state: {
        Args: { p_paid: boolean; p_payment_date: string; p_receivable_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "none" | "member" | "admin";
      chapter_income_source:
        | "active_member_dues"
        | "new_member_fees"
        | "fundraising"
        | "alumni_donations"
        | "other";
      reimbursement_category:
        | "administration"
        | "rush"
        | "socials"
        | "education"
        | "philanthropy"
        | "brother_bonding"
        | "retreat"
        | "house"
        | "miscellaneous_fees";
      reimbursement_status:
        | "pending"
        | "verified"
        | "mismatch"
        | "approved"
        | "denied"
        | "processing_failed";
      hosting_finance_status: "confirmed" | "cancelled";
      hosting_payment_kind: "revenue" | "fire_permit";
    };
    CompositeTypes: Record<string, never>;
  };
};
