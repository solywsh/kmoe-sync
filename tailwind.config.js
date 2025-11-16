/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./scripts/**/*.js",
    "./content/**/*.js",
    "./src/**/*.html",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0C111D",
          800: "#121A2C",
          700: "#1B253B",
        },
      },
      boxShadow: {
        glass: "0 20px 45px rgba(15,23,42,0.45)",
      },
    },
  },
  plugins: [],
};
