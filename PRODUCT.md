# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Prospective UC Berkeley students compare Theta Xi with other campus communities and decide whether to attend a recruitment event.
- Student groups and organizers evaluate the chapter house as an event venue and decide whether to ask about a booking.
- Alumni, members, families, and other visitors look for chapter information and public events.

## Product Purpose

The public cal.taxi site introduces Theta Xi Nu Chapter at UC Berkeley.
It gives recruitment and venue booking equal priority.
Success means that visitors can quickly find recruitment events or submit a venue inquiry.

## Positioning

One public site presents both the chapter community and its near-campus event venue.
The chapter has operated at UC Berkeley since 1910.

## Operating Context

Visitors can arrive without an account on `/`, `/events`, or `/host`.
The same repository also contains member and administrator tools.
The public site must remain clear to signed-out visitors and users with the `none` role.

## Capabilities and Constraints

- Public access groups are signed-out visitors and authenticated users with the `none` role.
- Private access groups are `member` and `admin`.
- Public routes are `/`, `/events`, and `/host`.
- The homepage must give recruitment and venue booking equal visual weight.
- The site structure and copy can change completely, but claims must remain factual.
- The public site must fit the repository's existing permission structure.

## Brand Commitments

- Keep the name Theta Xi, the Greek letters ΘΞ, Nu Chapter, UC Berkeley, and cal.taxi.
- Adapt the established admin-cal-taxi visual system from an operating interface to a public marketing surface.
- Use Inter for Greek letters and Greek text because it includes Greek glyphs.
- Do not use Old English Text MT because it does not include Greek glyphs.
- Public photographs must not show alcohol.

## Evidence on Hand

- The current public site is in `/Users/nathan.dai/Programming/calthetaxi`.
- The current admin visual system is in this repository.
- Supplied photographs are in `/Users/nathan.dai/Downloads/taxi`.
- Supplied subjects include graduation, awards, travel, informal meals, group work, outdoor trips, and social gatherings.
- The current public site states that Nu Chapter has been at UC Berkeley since 1910.
- No public chapter contact email is available; venue questions use the on-site inquiry form.
- The current public site claims venue capacity for 200 guests, a near-campus location, flexible setup, and event-team coordination.
- No verified testimonials, prices, current event dates, or performance statistics are available.

## Product Principles

- Give recruitment and venue booking equal prominence.
- Show real chapter life before making broad claims.
- Keep public information available without authentication.
- Keep every claim traceable to existing content or confirmed input.
- Make each next action clear within the first viewport.

## Accessibility & Inclusion

Support keyboard navigation, visible focus, reduced motion, sufficient contrast, semantic headings, and meaningful image descriptions.
