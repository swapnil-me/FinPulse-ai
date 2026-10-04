import { useEffect, useState } from "react";
import {
  Alert,
  App,
  Button,
  Divider,
  Form,
  Input,
  List,
  Popconfirm,
  Tag,
} from "antd";
import { api, clearToken, type DeviceSession } from "../api";

export function AccountSecurity() {
  const { message } = App.useApp();
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form] = Form.useForm();
  async function load() {
    setLoading(true);
    try {
      setSessions(await api.sessions());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <Divider>Account security</Divider>
      <Form
        form={form}
        layout="vertical"
        onFinish={async (values) => {
          setLoading(true);
          try {
            await api.changePassword({
              current_password: values.current_password,
              new_password: values.new_password,
            });
            message.success("Password changed. Sign in again on your devices.");
          } catch (e) {
            message.error((e as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <Form.Item
          label="Current password"
          name="current_password"
          rules={[{ required: true }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          label="New password"
          name="new_password"
          rules={[{ required: true, min: 12, max: 72 }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          label="Confirm new password"
          name="confirm"
          dependencies={["new_password"]}
          rules={[
            { required: true },
            ({ getFieldValue }) => ({
              validator(_, value) {
                return value === getFieldValue("new_password")
                  ? Promise.resolve()
                  : Promise.reject(new Error("Passwords must match."));
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button htmlType="submit" loading={loading}>
          Change password & sign out all devices
        </Button>
      </Form>
      <Divider>Active sessions</Divider>
      {error && (
        <Alert
          type="error"
          message={error}
          action={<Button onClick={load}>Retry</Button>}
        />
      )}
      <List
        loading={loading}
        dataSource={sessions}
        locale={{ emptyText: "No active sessions" }}
        renderItem={(session) => (
          <List.Item
            actions={[
              <Popconfirm
                key="revoke"
                title="Sign out this session?"
                onConfirm={async () => {
                  try {
                    await api.revokeSession(session.id);
                    if (session.current) clearToken();
                    else await load();
                  } catch (e) {
                    message.error((e as Error).message);
                  }
                }}
              >
                <Button danger size="small">
                  Revoke
                </Button>
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={
                <span>
                  {session.current ? "This session" : "Another session"}{" "}
                  {session.current && <Tag color="purple">Current</Tag>}
                </span>
              }
              description={`Signed in ${new Date(session.created_at).toLocaleString()}. Expires ${new Date(session.expires_at).toLocaleString()}.`}
            />
          </List.Item>
        )}
      />
      <div
        style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}
      >
        <Button
          danger
          onClick={async () => {
            try {
              await api.logout();
            } catch (e) {
              message.error((e as Error).message);
            }
          }}
        >
          Sign out
        </Button>
        <Popconfirm
          title="Sign out every device?"
          onConfirm={async () => {
            try {
              await api.logout(true);
            } catch (e) {
              message.error((e as Error).message);
            }
          }}
        >
          <Button danger>Sign out all devices</Button>
        </Popconfirm>
      </div>
    </>
  );
}
