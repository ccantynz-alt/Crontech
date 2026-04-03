import type { Meta, StoryObj } from "storybook-solidjs";
import { Select } from "../index";

const sampleOptions = [
  { value: "react", label: "React" },
  { value: "solid", label: "SolidJS" },
  { value: "vue", label: "Vue" },
  { value: "svelte", label: "Svelte" },
];

const meta: Meta<typeof Select> = {
  title: "Components/Select",
  component: Select,
  tags: ["autodocs"],
  argTypes: {
    label: { control: "text" },
    error: { control: "text" },
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {
  args: {
    options: sampleOptions,
    placeholder: "Choose a framework...",
  },
};

export const WithLabel: Story = {
  args: {
    options: sampleOptions,
    label: "Preferred Framework",
    placeholder: "Select one...",
  },
};

export const WithError: Story = {
  args: {
    options: sampleOptions,
    label: "Framework",
    error: "Please select a framework",
    name: "framework",
  },
};

export const Disabled: Story = {
  args: {
    options: sampleOptions,
    label: "Framework",
    value: "solid",
    disabled: true,
  },
};
