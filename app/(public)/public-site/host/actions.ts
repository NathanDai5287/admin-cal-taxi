"use server";

import { headers } from "next/headers";

import { VenueInquiryRateLimitError, saveVenueInquiry } from "@/lib/venue-inquiries";
import { venueInquirySchema, venueInquiryValidationMessage } from "@/lib/venue-inquiry";

export type VenueInquiryFormState = {
  status: "idle" | "success" | "error";
  message: string;
  values: VenueInquiryFormValues;
};

export type VenueInquiryFormValues = {
  contactName: string;
  email: string;
  organization: string;
  eventType: string;
  eventDate: string;
  guestCount: string;
  details: string;
};

const emptyValues: VenueInquiryFormValues = {
  contactName: "",
  email: "",
  organization: "",
  eventType: "",
  eventDate: "",
  guestCount: "",
  details: "",
};

function textValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function submitVenueInquiry(
  _previousState: VenueInquiryFormState,
  formData: FormData,
): Promise<VenueInquiryFormState> {
  if (textValue(formData, "website")) {
    return {
      status: "success",
      message: "Thanks. We received your venue inquiry.",
      values: emptyValues,
    };
  }

  const values = {
    contactName: textValue(formData, "contactName"),
    email: textValue(formData, "email"),
    organization: textValue(formData, "organization"),
    eventType: textValue(formData, "eventType"),
    eventDate: textValue(formData, "eventDate"),
    guestCount: textValue(formData, "guestCount"),
    details: textValue(formData, "details"),
  };
  const result = venueInquirySchema.safeParse(values);

  if (!result.success) {
    return {
      status: "error",
      message: venueInquiryValidationMessage(result.error),
      values,
    };
  }

  const headerStore = await headers();
  const address = (headerStore.get("x-forwarded-for") ?? headerStore.get("x-real-ip") ?? "unknown")
    .split(",", 1)[0]
    .trim();
  const userAgent = headerStore.get("user-agent") ?? "unknown";

  try {
    await saveVenueInquiry(result.data, `${address}|${userAgent}`);
    return {
      status: "success",
      message: "Thanks. We received your venue inquiry.",
      values: emptyValues,
    };
  } catch (error) {
    if (error instanceof VenueInquiryRateLimitError) {
      return {
        status: "error",
        message: "You sent several inquiries. Please try again in 15 minutes.",
        values,
      };
    }
    console.error("Could not save venue inquiry", error);
    return {
      status: "error",
      message: "We could not send your inquiry. Please try again.",
      values,
    };
  }
}
