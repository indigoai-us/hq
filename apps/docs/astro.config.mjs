import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "HQ",
      description: "Personal OS for AI Workers",
      social: {
        github: "https://github.com/indigoai-us/hq",
      },
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Product Guide",
          autogenerate: { directory: "guide" },
        },
        {
          label: "Architecture",
          autogenerate: { directory: "architecture" },
        },
        {
          label: "Development",
          autogenerate: { directory: "development" },
        },
        {
          label: "Roadmap",
          autogenerate: { directory: "roadmap" },
        },
      ],
    }),
  ],
});
