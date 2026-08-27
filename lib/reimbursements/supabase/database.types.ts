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
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: Database["public"]["Enums"]["app_role"];
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          role?: Database["public"]["Enums"]["app_role"];
          created_at?: string;
        };
        Update: {
          full_name?: string;
        };
        Relationships: [];
      };
      reimbursements: {
        Row: {
          id: string;
          user_id: string;
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
          user_id: string;
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
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: {
      app_role: "member" | "admin";
      reimbursement_category:
        | "food"
        | "supplies"
        | "travel"
        | "events"
        | "utilities"
        | "other";
      reimbursement_status:
        | "processing"
        | "pending"
        | "verified"
        | "approved"
        | "denied"
        | "processing_failed";
    };
    CompositeTypes: Record<string, never>;
  };
};
