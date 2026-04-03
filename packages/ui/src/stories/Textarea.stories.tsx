import type { Meta, StoryObj } from "storybook-solidjs";
import { Textarea } from "../index";

const meta: Meta<typeof Textarea> = {
  title: "Components/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  argTypes: {
    label: { control: "text" },
    error: { control: "text" },
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
    resize: { control: "select", options: ["none", "vertical", "horizontal", "both"] },
  },
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: {},
};

export const WithPlaceholder: Story = {
  args: {
    placeholder: "Write your message here...",
  },
};

export const WithLabel: Story = {
  args: {
    label: "Description",
    placeholder: "Provide a detailed description of the issue...",
    rows: 4,
  },
};

export const Disabled: Story = {
  args: {
    label: "Read-Only Notes",
    value: "This content cannot be edited.",
    disabled: true,
  },
};
