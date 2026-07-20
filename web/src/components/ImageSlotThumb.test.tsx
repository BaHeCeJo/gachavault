import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ImageSlotThumb from "./ImageSlotThumb";

describe("ImageSlotThumb", () => {
  it("renders the image when a url is set", () => {
    render(
      <ImageSlotThumb
        src="https://hotarumi.com/uploads/abc.webp"
        alt="Genshin banner"
        label="Banner"
        width={64}
        height={36}
      />,
    );

    const img = screen.getByAltText("Genshin banner");
    expect(img).toHaveAttribute("src", "https://hotarumi.com/uploads/abc.webp");
    expect(screen.getByTitle("Banner")).toBeInTheDocument();
  });

  it("renders a placeholder naming the slot when the url is null", () => {
    render(<ImageSlotThumb src={null} alt="Genshin logo" label="Logo" width={28} height={28} />);

    expect(screen.queryByAltText("Genshin logo")).not.toBeInTheDocument();
    expect(screen.getByTitle("Logo: not set")).toBeInTheDocument();
  });

  it("treats an empty-string url as unset", () => {
    // The admin forms store cleared uploads as "" rather than null, so the
    // placeholder has to cover both.
    render(<ImageSlotThumb src="" alt="Genshin logo" label="Logo" width={28} height={28} />);

    expect(screen.getByTitle("Logo: not set")).toBeInTheDocument();
  });

  it("falls back when the image fails to load", () => {
    render(
      <ImageSlotThumb
        src="https://hotarumi.com/uploads/gone.webp"
        alt="Dead banner"
        label="Banner"
        width={64}
        height={36}
      />,
    );

    fireEvent.error(screen.getByAltText("Dead banner"));

    expect(screen.queryByAltText("Dead banner")).not.toBeInTheDocument();
    expect(screen.getByText("!")).toBeInTheDocument();
  });

  it("applies the requested dimensions to the slot box", () => {
    const { container } = render(
      <ImageSlotThumb src={null} alt="x" label="Banner" width={64} height={36} />,
    );

    expect(container.firstChild).toHaveStyle({ width: "64px", height: "36px" });
  });
});
