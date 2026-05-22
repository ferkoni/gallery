import { describe, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { S3CredentialForm } from "@/features/settings/components/S3CredentialForm.tsx";

const defaultProps = {
  configured: false,
  onSubmit: vi.fn(),
  onDelete: vi.fn(),
  isPending: false,
  isError: false,
  isDeleting: false,
  isDeleteError: false,
};

const validData = {
  accessKeyId: "access-key-id-input",
  secretAccessKey: "secret-access-key-input",
  region: "us-east-1",
  bucket: "my-bucket",
};

async function fillValidForm() {
  fireEvent.change(screen.getByTestId("access-key-id-input"), { target: { value: validData.accessKeyId } });
  fireEvent.change(screen.getByTestId("secret-access-key-input"), { target: { value: validData.secretAccessKey } });
  fireEvent.change(screen.getByTestId("region-input"), { target: { value: validData.region } });
  fireEvent.change(screen.getByTestId("bucket-input"), { target: { value: validData.bucket } });
}

describe("S3CredentialForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all form inputs and submit button", () => {
    render(<S3CredentialForm {...defaultProps} />);

    expect(screen.getByTestId("access-key-id-input")).toBeInTheDocument();
    expect(screen.getByTestId("secret-access-key-input")).toBeInTheDocument();
    expect(screen.getByTestId("region-input")).toBeInTheDocument();
    expect(screen.getByTestId("bucket-input")).toBeInTheDocument();
    expect(screen.getByTestId("submit-button")).toBeInTheDocument();
  });

  it("does not show delete button or configured banner when not configured", () => {
    render(<S3CredentialForm {...defaultProps} configured={false} />);

    expect(screen.queryByTestId("delete-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("configured-banner")).not.toBeInTheDocument();
  });

  it("shows delete button and configured banner when configured", () => {
    render(<S3CredentialForm {...defaultProps} configured={true} />);

    expect(screen.getByTestId("delete-button")).toBeInTheDocument();
    expect(screen.getByTestId("configured-banner")).toBeInTheDocument();
  });

  it("shows 'Add' label on submit button when not configured", () => {
    render(<S3CredentialForm {...defaultProps} configured={false} />);

    expect(screen.getByTestId("submit-button")).toHaveTextContent("Add");
  });

  it("shows 'Update' label on submit button when configured", () => {
    render(<S3CredentialForm {...defaultProps} configured={true} />);

    expect(screen.getByTestId("submit-button")).toHaveTextContent("Update");
  });

  it("disables submit button and shows 'Adding...' when isPending and not configured", () => {
    render(<S3CredentialForm {...defaultProps} configured={false} isPending={true} />);

    expect(screen.getByTestId("submit-button")).toBeDisabled();
    expect(screen.getByTestId("submit-button")).toHaveTextContent("Adding...");
  });

  it("disables submit button and shows 'Updating...' when isPending and configured", () => {
    render(<S3CredentialForm {...defaultProps} configured={true} isPending={true} />);

    expect(screen.getByTestId("submit-button")).toBeDisabled();
    expect(screen.getByTestId("submit-button")).toHaveTextContent("Updating...");
  });

  it("disables delete button and shows 'Deleting...' when isDeleting", () => {
    render(<S3CredentialForm {...defaultProps} configured={true} isDeleting={true} />);

    expect(screen.getByTestId("delete-button")).toBeDisabled();
    expect(screen.getByTestId("delete-button")).toHaveTextContent("Deleting...");
  });

  it("shows error message when isError", () => {
    render(<S3CredentialForm {...defaultProps} isError={true} />);

    expect(screen.getByTestId("error-label")).toBeInTheDocument();
  });

  it("shows delete error message when isDeleteError", () => {
    render(<S3CredentialForm {...defaultProps} isDeleteError={true} />);

    expect(screen.getByTestId("delete-error-label")).toBeInTheDocument();
  });

  it("calls onDelete when delete button is clicked", async () => {
    render(<S3CredentialForm {...defaultProps} configured={true} />);

    await userEvent.click(screen.getByTestId("delete-button"));

    expect(defaultProps.onDelete).toHaveBeenCalled();
  });

  it("calls onSubmit with form data when submitted with valid data", async () => {
    render(<S3CredentialForm {...defaultProps} />);

    await fillValidForm();
    await userEvent.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({
        access_key_id: validData.accessKeyId,
        secret_access_key: validData.secretAccessKey,
        region: validData.region,
        bucket: validData.bucket,
      }, expect.anything());
    });
  });

  it("shows Required error and does not submit when access_key_id is empty", async () => {
    render(<S3CredentialForm {...defaultProps} />);

    fireEvent.change(screen.getByTestId("secret-access-key-input"), { target: { value: validData.secretAccessKey } });
    fireEvent.change(screen.getByTestId("region-input"), { target: { value: validData.region } });
    fireEvent.change(screen.getByTestId("bucket-input"), { target: { value: validData.bucket } });
    await userEvent.click(screen.getByTestId("submit-button"));

    expect(await screen.findByTestId("access-key-id-error-label")).toHaveTextContent(/required/i);
    await waitFor(() => expect(defaultProps.onSubmit).not.toHaveBeenCalled());
  });

  it("shows Required error and does not submit when secret_access_key is empty", async () => {
    render(<S3CredentialForm {...defaultProps} />);

    fireEvent.change(screen.getByTestId("access-key-id-input"), { target: { value: validData.accessKeyId } });
    fireEvent.change(screen.getByTestId("region-input"), { target: { value: validData.region } });
    fireEvent.change(screen.getByTestId("bucket-input"), { target: { value: validData.bucket } });
    await userEvent.click(screen.getByTestId("submit-button"));

    expect(await screen.findByTestId("secret-access-key-error-label")).toHaveTextContent(/required/i);
    await waitFor(() => expect(defaultProps.onSubmit).not.toHaveBeenCalled());
  });

  it("shows Required error and does not submit when region is empty", async () => {
    render(<S3CredentialForm {...defaultProps} />);

    fireEvent.change(screen.getByTestId("access-key-id-input"), { target: { value: validData.accessKeyId } });
    fireEvent.change(screen.getByTestId("secret-access-key-input"), { target: { value: validData.secretAccessKey } });
    fireEvent.change(screen.getByTestId("bucket-input"), { target: { value: validData.bucket } });
    await userEvent.click(screen.getByTestId("submit-button"));

    expect(await screen.findByTestId("region-error-label")).toHaveTextContent(/required/i);
    await waitFor(() => expect(defaultProps.onSubmit).not.toHaveBeenCalled());
  });

  it("shows invalid format error and does not submit when region format is invalid", async () => {
    render(<S3CredentialForm {...defaultProps} />);

    await fillValidForm();
    fireEvent.change(screen.getByTestId("region-input"), { target: { value: "invalid-region" } });
    await userEvent.click(screen.getByTestId("submit-button"));

    expect(await screen.findByTestId("region-error-label")).toHaveTextContent(/invalid region format/i);
    await waitFor(() => expect(defaultProps.onSubmit).not.toHaveBeenCalled());
  });

  it("shows Required error and does not submit when bucket is empty", async () => {
    render(<S3CredentialForm {...defaultProps} />);

    fireEvent.change(screen.getByTestId("access-key-id-input"), { target: { value: validData.accessKeyId } });
    fireEvent.change(screen.getByTestId("secret-access-key-input"), { target: { value: validData.secretAccessKey } });
    fireEvent.change(screen.getByTestId("region-input"), { target: { value: validData.region } });
    await userEvent.click(screen.getByTestId("submit-button"));

    expect(await screen.findByTestId("bucket-error-label")).toHaveTextContent(/required/i);
    await waitFor(() => expect(defaultProps.onSubmit).not.toHaveBeenCalled());
  });

  it("shows max length error and does not submit when access_key_id exceeds 255 characters", async () => {
    render(<S3CredentialForm {...defaultProps} />);

    await fillValidForm();
    fireEvent.change(screen.getByTestId("access-key-id-input"), { target: { value: "A".repeat(256) } });
    await userEvent.click(screen.getByTestId("submit-button"));

    expect(await screen.findByTestId("access-key-id-error-label")).toHaveTextContent(/255/);
    await waitFor(() => expect(defaultProps.onSubmit).not.toHaveBeenCalled());
  });

  it("shows max length error and does not submit when secret_access_key exceeds 255 characters", async () => {
    render(<S3CredentialForm {...defaultProps} />);

    await fillValidForm();
    fireEvent.change(screen.getByTestId("secret-access-key-input"), { target: { value: "A".repeat(256) } });
    await userEvent.click(screen.getByTestId("submit-button"));

    expect(await screen.findByTestId("secret-access-key-error-label")).toHaveTextContent(/255/);
    await waitFor(() => expect(defaultProps.onSubmit).not.toHaveBeenCalled());
  });
});
