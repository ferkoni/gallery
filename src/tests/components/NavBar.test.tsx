import { describe, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NavBar } from "@/components/NavBar.tsx";
import { AuthContext } from "@/features/auth/context/AuthContext";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockLogout = vi.fn();

function renderNavBar(token: string | null) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={{ token, login: vi.fn(), logout: mockLogout, s3CredentialConfigured: false, setS3CredentialConfigured: vi.fn() }}>
        <NavBar />
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

function renderNavBarAtPath(token: string | null, path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={{ token, login: vi.fn(), logout: mockLogout, s3CredentialConfigured: false, setS3CredentialConfigured: vi.fn() }}>
        <NavBar />
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

describe("NavBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Login link when not logged in", () => {
    renderNavBar(null);

    expect(screen.getByRole("link", { name: /login/i })).toBeInTheDocument();
    expect(screen.queryByTestId("settings-menu-button")).not.toBeInTheDocument();
    expect(screen.queryByText(/logout/i)).not.toBeInTheDocument();
  });

  it("renders Albums, Settings and Logout when logged in", () => {
    renderNavBar("token");

    expect(screen.getByRole("link", { name: /albums/i })).toBeInTheDocument();
    expect(screen.getByTestId("settings-menu-button")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /login/i })).not.toBeInTheDocument();
  });

  it("calls logout and navigates to '/' when Logout is clicked", async () => {
    renderNavBar("token");

    await userEvent.click(screen.getByRole("button", { name: /logout/i }));

    expect(mockLogout).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("does not show Settings dropdown by default", () => {
    renderNavBar("token");

    expect(screen.queryByTestId("settings-dropdown")).not.toBeInTheDocument();
  });

  it("opens Settings dropdown when Settings button is clicked", async () => {
    renderNavBar("token");

    await userEvent.click(screen.getByTestId("settings-menu-button"));

    expect(screen.getByTestId("settings-dropdown")).toBeInTheDocument();
  });

  it("shows S3 Credentials link inside the Settings dropdown", async () => {
    renderNavBar("token");

    await userEvent.click(screen.getByTestId("settings-menu-button"));

    expect(screen.getByRole("link", { name: /s3 credentials/i })).toBeInTheDocument();
  });

  it("closes Settings dropdown when S3 Credentials link is clicked", async () => {
    renderNavBar("token");

    await userEvent.click(screen.getByTestId("settings-menu-button"));
    await userEvent.click(screen.getByRole("link", { name: /s3 credentials/i }));

    expect(screen.queryByTestId("settings-dropdown")).not.toBeInTheDocument();
  });

  it("closes Settings dropdown when clicking outside", async () => {
    renderNavBar("token");

    await userEvent.click(screen.getByTestId("settings-menu-button"));
    expect(screen.getByTestId("settings-dropdown")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByTestId("settings-dropdown")).not.toBeInTheDocument();
  });

  it("toggles Settings dropdown closed when Settings button is clicked again", async () => {
    renderNavBar("token");

    await userEvent.click(screen.getByTestId("settings-menu-button"));
    expect(screen.getByTestId("settings-dropdown")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("settings-menu-button"));
    expect(screen.queryByTestId("settings-dropdown")).not.toBeInTheDocument();
  });

  describe("search input", () => {
    it("renders the search input when logged in", () => {
      renderNavBar("token");
      expect(screen.getByPlaceholderText("Search images…")).toBeInTheDocument();
    });

    it("does not render the search input when logged out", () => {
      renderNavBar(null);
      expect(screen.queryByPlaceholderText("Search images…")).not.toBeInTheDocument();
    });

    it("navigates to /search?q=value when Enter is pressed", async () => {
      renderNavBar("token");
      const input = screen.getByPlaceholderText("Search images…");
      await userEvent.type(input, "sunset{Enter}");
      expect(mockNavigate).toHaveBeenCalledWith("/search?q=sunset");
    });

    it("does not navigate when Enter is pressed with an empty input", async () => {
      renderNavBar("token");
      const input = screen.getByPlaceholderText("Search images…");
      await userEvent.type(input, "{Enter}");
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("reflects the q URL param when on the /search route", () => {
      renderNavBarAtPath("token", "/search?q=sunset");
      expect(screen.getByPlaceholderText("Search images…")).toHaveValue("sunset");
    });

    it("shows an empty input on non-search routes", () => {
      renderNavBarAtPath("token", "/albums");
      expect(screen.getByPlaceholderText("Search images…")).toHaveValue("");
    });
  });
});
