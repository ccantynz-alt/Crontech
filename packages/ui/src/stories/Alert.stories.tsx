import type { Meta, StoryObj } from "storybook-solidjs";
import { Alert } from "../index";

const meta: Meta<typeof Alert> = {
  title: "Components/Alert",
  component: Alert,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["info", "success", "warning", "error"],
    },
    title: { control: "text" },
    description: { control: "text" },
    dismissible: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Alert>;

export const Info: Story = {
  args: {
    variant: "info",
    title: "Information",
    description: "Your account settings have been updated successfully.",
  },
};

export const Success: Story = {
  args: {
    variant: "success",
    title: "Success",
    description: "The deployment completed without errors.",
  },
};

export const Warning: Story = {
  args: {
    variant: "warning",
    title: "Warning",
    description: "Your API key will expire in 7 days. Please rotate it.",
  },
};

export const Error: Story = {
  args: {
    variant: "error",
    title: "Error",
    description: "Failed to connect to the database. Check your connection string.",
  },
};

export const Dismissible: Story = {
  args: {
    variant: "info",
    title: "Heads Up",
    description: "This alert can be dismissed by clicking the close button.",
    dismissible: true,
  },
};
