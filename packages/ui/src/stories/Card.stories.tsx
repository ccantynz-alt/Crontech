import type { Meta, StoryObj } from "storybook-solidjs";
import { Card } from "../index";

const meta: Meta<typeof Card> = {
  title: "Components/Card",
  component: Card,
  tags: ["autodocs"],
  argTypes: {
    title: { control: "text" },
    description: { control: "text" },
    padding: { control: "select", options: ["none", "sm", "md", "lg"] },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: {
    children: "Basic card content goes here.",
  },
};

export const WithTitle: Story = {
  args: {
    title: "Project Overview",
    children: "This card displays a summary of the current project status.",
  },
};

export const WithContent: Story = {
  args: {
    title: "Team Members",
    description: "Active contributors to the project",
    children: "Alice, Bob, Charlie, Diana",
  },
};

export const Padded: Story = {
  args: {
    title: "Large Padding",
    padding: "lg",
    children: "This card uses large padding for extra breathing room.",
  },
};
