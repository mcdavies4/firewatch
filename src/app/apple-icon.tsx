import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon for iPhones (PNG, generated from the same flame as icon.svg). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#dc2626",
        }}
      >
        <svg width="132" height="132" viewBox="0 0 64 64">
          <path
            fill="#fff"
            d="M33.5 8c1.6 7.6-2.4 11.4-6.2 15.4-3.9 4-7.8 8.2-7.8 15 0 9.3 6.1 16.6 13.6 16.6 7.8 0 13.4-6.5 13.4-15.2 0-6.4-3-10.6-5.6-14.2-.3 3.5-1.8 6.1-4.1 7.4.8-8.1-.4-17.6-3.3-25z"
          />
          <path
            fill="#fde047"
            d="M32.6 33.5c-3.4 3.6-5.6 6.3-5.6 10.2 0 4 2.6 6.9 5.9 6.9 3.4 0 5.8-2.9 5.8-6.6 0-3.1-1.6-5.2-3.1-7-.4 1.7-1.3 2.8-2.4 3.3.1-2.4 0-4.6-.6-6.8z"
          />
        </svg>
      </div>
    ),
    size,
  );
}
