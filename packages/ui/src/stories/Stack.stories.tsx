import type { Meta, StoryObj } from "storybook-solidjs";
import { Stack } from "../index";

const meta: Meta<typeof Stack> = {
  title: "Components/Stack",
  component: Stack,
  tags: ["autodocs"],
  argTypes: {
    direction: { control: "select", options: ["horizontal", "vertical"] },
    gap: { control: "select", options: ["none", "xs", "sm", "md", "lg", "xl"] },
    align: { control: "select", options: ["start", "center", "end", "stretch"] },
    justify: { control: "select", options: ["start", "center", "end", "between", "around"] },
  },
};

export default meta;
type Story = StoryObj<typeof Stack>;

export const Vertical: Story = {
  args: {
    direction: "vertical",
    gap: "md",
    children: ["First item", "Second item", "Third item"].join(" | "),
  },
};

export const Horizontal: Story = {
  args: {
    direction: "horizontal",
    gap: "md",
    children: ["Left", "Center", "Right"].join(" | "),
  },
};

export const WithGap: Story = {
  args: {
    direction: "vertical",
    gap: "xl",
    children: ["Item with extra spacing", "Another item", "Last item"].join(" | "),
  },
};
