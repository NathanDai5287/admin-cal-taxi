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
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          role: Database["public"]["Enums"]["app_role"];
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          email?: string;
          role?: Database["public"]["Enums"]["app_role"];
          created_at?: string;
        };
        Update: {
          full_name?: string;
          email?: string;
          role?: Database["public"]["Enums"]["app_role"];
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
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: {
      app_role: "none" | "member" | "admin";
      reimbursement_category:
        | "food"
        | "supplies"
        | "travel"
        | "events"
        | "utilities"
        | "other";
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
