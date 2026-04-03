import type { Meta, StoryObj } from "storybook-solidjs";
import { Tooltip } from "../index";

const meta: Meta<typeof Tooltip> = {
  title: "Components/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
  argTypes: {
    content: { control: "text" },
    position: { control: "select", options: ["top", "bottom", "left", "right"] },
  },
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Top: Story = {
  args: {
    content: "Tooltip on top",
    position: "top",
    children: "Hover me (top)",
  },
};

export const Bottom: Story = {
  args: {
    content: "Tooltip on bottom",
    position: "bottom",
    children: "Hover me (bottom)",
  },
};

export const Left: Story = {
  args: {
    content: "Tooltip on left",
    position: "left",
    children: "Hover me (left)",
  },
};

export const Right: Story = {
  args: {
    content: "Tooltip on right",
    position: "right",
    children: "Hover me (right)",
  },
};
