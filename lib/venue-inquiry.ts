import { z } from "zod";

const optionalDate = z.union([
  z.literal(""),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid event date."),
]);

const optionalGuestCount = z.union([
  z.literal(""),
  z.coerce.number().int("Enter a whole number.").min(1, "Enter at least one guest.").max(200, "The venue capacity is 200 guests."),
], { error: "Enter expected guests as a whole number." });

export const venueInquirySchema = z.object({
  contactName: z.string().trim().min(2, "Enter your name.").max(120, "Keep your name under 120 characters."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254, "Keep your email under 254 characters."),
  organization: z.string().trim().min(2, "Enter your organization.").max(160, "Keep your organization under 160 characters."),
  eventType: z.string().trim().min(2, "Enter an event type.").max(80, "Keep the event type under 80 characters."),
  eventDate: optionalDate,
  guestCount: optionalGuestCount,
  details: z.string().trim().min(10, "Message must include at least 10 characters.").max(3000, "Keep your message under 3,000 characters."),
});

export type VenueInquiryInput = z.infer<typeof venueInquirySchema>;
export type VenueInquiryField = keyof VenueInquiryInput;

export function venueInquiryValidationMessage(error: z.ZodError<VenueInquiryInput>) {
  return error.issues[0].message;
}
