import type { Meta, StoryObj } from "storybook-solidjs";
import { Input } from "../index";

const meta: Meta<typeof Input> = {
  title: "Components/Input",
  component: Input,
  tags: ["autodocs"],
  argTypes: {
    label: { control: "text" },
    error: { control: "text" },
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
    type: { control: "select", options: ["text", "password", "email", "number"] },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: {},
};

export const WithPlaceholder: Story = {
  args: {
    placeholder: "Enter your name...",
  },
};

export const WithLabel: Story = {
  args: {
    label: "Email Address",
    placeholder: "you@example.com",
    type: "email",
  },
};

export const WithError: Story = {
  args: {
    label: "Username",
    value: "ab",
    error: "Username must be at least 3 characters",
  },
};

export const Disabled: Story = {
  args: {
    label: "Disabled Field",
    value: "Cannot edit this",
    disabled: true,
  },
};

export const Password: Story = {
  args: {
    label: "Password",
    type: "password",
    placeholder: "Enter password...",
  },
};

export const Required: Story = {
  args: {
    label: "Full Name",
    placeholder: "Jane Doe",
    required: true,
  },
};
