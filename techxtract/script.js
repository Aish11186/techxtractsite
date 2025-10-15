// Simple glowing nav interaction
const links = document.querySelectorAll(".nav-links a");
links.forEach(link => {
  link.addEventListener("mouseenter", () => {
    link.style.textShadow = "0 0 15px #00ffe0";
  });
  link.addEventListener("mouseleave", () => {
    link.style.textShadow = "none";
  });
});
