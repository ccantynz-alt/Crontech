import type { Meta, StoryObj } from "storybook-solidjs";
import { Badge } from "../index";

const meta: Meta<typeof Badge> = {
  title: "Components/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "success", "warning", "error", "info"],
    },
    size: { control: "select", options: ["sm", "md"] },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: {
    children: "Default",
  },
};

export const Success: Story = {
  args: {
    variant: "success",
    children: "Active",
  },
};

export const Warning: Story = {
  args: {
    variant: "warning",
    children: "Pending",
  },
};

export const Error: Story = {
  args: {
    variant: "error",
    children: "Failed",
  },
};

export const Info: Story = {
  args: {
    variant: "info",
    children: "New",
  },
};
