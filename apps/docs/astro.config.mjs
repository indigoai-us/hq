import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "HQ by Indigo",
      description: "HQ by Indigo — Personal OS for AI Workers",
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
