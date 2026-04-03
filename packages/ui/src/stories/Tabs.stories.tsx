import type { Meta, StoryObj } from "storybook-solidjs";
import { Tabs } from "../index";

const meta: Meta<typeof Tabs> = {
  title: "Components/Tabs",
  component: Tabs,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  args: {
    items: [
      { id: "overview", label: "Overview", content: "Project overview and summary information." },
      { id: "settings", label: "Settings", content: "Configure project settings and preferences." },
      { id: "members", label: "Members", content: "Manage team members and permissions." },
    ],
    defaultTab: "overview",
  },
};

export const WithDisabledTab: Story = {
  args: {
    items: [
      { id: "active", label: "Active", content: "Currently active items are displayed here." },
      { id: "archived", label: "Archived", content: "Archived items are displayed here.", disabled: true },
      { id: "drafts", label: "Drafts", content: "Draft items awaiting review." },
    ],
    defaultTab: "active",
  },
};
