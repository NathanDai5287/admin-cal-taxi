export const HOUSE_ADDRESS = "2639 Durant Ave, Berkeley, CA 94704";

export const houseDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(HOUSE_ADDRESS)}`;

const houseMapEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(HOUSE_ADDRESS)}&z=16&output=embed`;

export function HouseMap() {
  return (
    <div className="house-map">
      <iframe
        title="Map of the Theta Xi chapter house at 2639 Durant Ave, next to the UC Berkeley campus"
        src={houseMapEmbedUrl}
        loading="lazy"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
