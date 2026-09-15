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
      reimbursement_budgets: {
        Row: {
          budget_key: string;
          amount: number | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          budget_key: string;
          amount?: number | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number | null;
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
          term_label: string;
          term_start: string;
          term_end: string;
          opening_cash?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          chapter_name?: string;
          term_label?: string;
          term_start?: string;
          term_end?: string;
          opening_cash?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      chapter_receivables: {
        Row: {
          member_id: string | null;
          id: string;
          member_name: string;
          amount_assessed: number;
          amount_paid: number;
          due_date: string;
          discord_user_id: string;
          notes: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          member_id?: string | null;
          id?: string;
          member_name: string;
          amount_assessed: number;
          amount_paid?: number;
          due_date: string;
          discord_user_id?: string;
          notes?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          member_id?: string | null;
          member_name?: string;
          amount_assessed?: number;
          amount_paid?: number;
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
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          email?: string;
          role?: Database["public"]["Enums"]["app_role"];
          removed_at?: string | null;
          created_at?: string;
        };
        Update: {
          full_name?: string;
          email?: string;
          role?: Database["public"]["Enums"]["app_role"];
          removed_at?: string | null;
        };
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
          reimbursed: boolean;
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
          reimbursed?: boolean;
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
          reimbursed?: boolean;
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
      admin_invite_email: {
        Args: { invite_email: string; invite_role: "none" | "member" | "admin" };
        Returns: undefined;
      };
      admin_remove_profile: {
        Args: { target_user_id: string };
        Returns: undefined;
      };
      admin_set_profile_role: {
        Args: { new_role: "none" | "member" | "admin"; target_user_id: string };
        Returns: undefined;
      };
      claim_pending_invite: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
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
        | "house";
      reimbursement_status:
        | "pending"
        | "verified"
        | "mismatch"
        | "approved"
        | "denied"
        | "processing_failed";
    };
    CompositeTypes: Record<string, never>;
  };
};
