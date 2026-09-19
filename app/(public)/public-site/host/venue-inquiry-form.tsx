"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  submitVenueInquiry,
  type VenueInquiryFormState,
  type VenueInquiryFormValues,
} from "./actions";
import styles from "./venue-inquiry.module.css";

const initialValues: VenueInquiryFormValues = {
  contactName: "",
  email: "",
  organization: "",
  eventType: "",
  eventDate: "",
  guestCount: "",
  details: "",
};

const initialState: VenueInquiryFormState = {
  status: "idle",
  message: "",
  values: initialValues,
};

export function VenueInquiryForm() {
  const [state, formAction, pending] = useActionState(submitVenueInquiry, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

  return (
    <form action={formAction} className={styles.form} id="venue-inquiry" ref={formRef}>
      <div className={styles.heading}>
        <h2>Tell us about your event.</h2>
        <p>We will reply with availability, pricing, and next steps.</p>
      </div>

      <div className={styles.twoColumns}>
        <label>
          Contact name
          <input autoComplete="name" defaultValue={state.values.contactName} maxLength={120} name="contactName" required />
        </label>
        <label>
          Requester email
          <input autoComplete="email" defaultValue={state.values.email} maxLength={254} name="email" required type="email" />
        </label>
      </div>

      <div className={styles.twoColumns}>
        <label>
          Organization
          <input autoComplete="organization" defaultValue={state.values.organization} maxLength={160} name="organization" required />
        </label>
        <label>
          Event type
          <select
            defaultValue={state.values.eventType}
            key={state.values.eventType}
            name="eventType"
            required
          >
            <option disabled value="">Select one</option>
            <option>Club or student event</option>
            <option>Fundraiser</option>
            <option>Mixer or social</option>
            <option>Private gathering</option>
            <option>Other</option>
          </select>
        </label>
      </div>

      <div className={styles.twoColumns}>
        <label>
          Preferred date <span>Optional</span>
          <input defaultValue={state.values.eventDate} name="eventDate" type="date" />
        </label>
        <label>
          Expected guests <span>Optional</span>
          <input defaultValue={state.values.guestCount} inputMode="numeric" max={200} min={1} name="guestCount" type="number" />
        </label>
      </div>

      <label>
        Message
        <textarea
          defaultValue={state.values.details}
          maxLength={3000}
          name="details"
          placeholder="Share timing, setup needs, and anything else we should know."
          required
          rows={5}
        />
      </label>

      <label aria-hidden="true" className={styles.honeypot}>
        Website
        <input autoComplete="off" name="website" tabIndex={-1} />
      </label>

      <div className={styles.footer}>
        <button disabled={pending} type="submit">
          {pending ? "Sending…" : "Send inquiry"}
        </button>
        <p aria-live="polite" className={state.status === "error" ? styles.error : styles.success}>
          {pending ? "" : state.message}
        </p>
      </div>
    </form>
  );
}
