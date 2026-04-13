import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "HQ Teams",
      description:
        "HQ Teams — shared workspaces for AI-powered teams, built on HQ by Indigo",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/indigoai-us/hq",
        },
      ],
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Guide",
          autogenerate: { directory: "guide" },
        },
        {
          label: "Architecture",
          autogenerate: { directory: "architecture" },
        },
        {
          label: "Reference",
          autogenerate: { directory: "reference" },
        },
      ],
    }),
  ],
});
