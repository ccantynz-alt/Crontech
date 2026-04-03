import type { Meta, StoryObj } from "storybook-solidjs";
import { Text } from "../index";

const meta: Meta<typeof Text> = {
  title: "Components/Text",
  component: Text,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["h1", "h2", "h3", "h4", "body", "caption", "code"],
    },
    weight: {
      control: "select",
      options: ["normal", "medium", "semibold", "bold"],
    },
    align: {
      control: "select",
      options: ["left", "center", "right"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Text>;

export const Heading1: Story = {
  args: {
    variant: "h1",
    children: "Heading Level 1",
  },
};

export const Heading2: Story = {
  args: {
    variant: "h2",
    children: "Heading Level 2",
  },
};

export const Heading3: Story = {
  args: {
    variant: "h3",
    children: "Heading Level 3",
  },
};

export const Heading4: Story = {
  args: {
    variant: "h4",
    children: "Heading Level 4",
  },
};

export const Body: Story = {
  args: {
    variant: "body",
    children: "This is body text used for paragraphs and general content throughout the application.",
  },
};

export const Caption: Story = {
  args: {
    variant: "caption",
    children: "Caption text for supplementary information",
  },
};

export const Code: Story = {
  args: {
    variant: "code",
    children: "const result = await fetchData();",
  },
};

export const Bold: Story = {
  args: {
    variant: "body",
    weight: "bold",
    children: "This text is rendered in bold weight.",
  },
};

export const Centered: Story = {
  args: {
    variant: "body",
    align: "center",
    children: "This text is centered within its container.",
  },
};
