import type { Meta, StoryObj } from "storybook-solidjs";
import { Modal } from "../index";

const meta: Meta<typeof Modal> = {
  title: "Components/Modal",
  component: Modal,
  tags: ["autodocs"],
  argTypes: {
    open: { control: "boolean" },
    title: { control: "text" },
    description: { control: "text" },
    size: { control: "select", options: ["sm", "md", "lg", "xl"] },
  },
};

export default meta;
type Story = StoryObj<typeof Modal>;

export const Default: Story = {
  args: {
    open: true,
    title: "Confirm Action",
    children: "Are you sure you want to proceed with this action?",
  },
};

export const WithDescription: Story = {
  args: {
    open: true,
    title: "Delete Project",
    description: "This action cannot be undone. All project data will be permanently removed.",
    children: "Please confirm you want to delete this project.",
  },
};

export const Small: Story = {
  args: {
    open: true,
    title: "Quick Note",
    size: "sm",
    children: "A compact modal for brief interactions.",
  },
};

export const Large: Story = {
  args: {
    open: true,
    title: "Project Settings",
    size: "lg",
    children: "This larger modal provides space for complex forms and detailed configuration options.",
  },
};
