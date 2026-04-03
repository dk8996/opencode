import { createMemo } from "solid-js"
import { useSync } from "@tui/context/sync"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useSDK } from "@tui/context/sdk"
import { useRoute } from "@tui/context/route"
import { Clipboard } from "@tui/util/clipboard"
import { usePromptHistory, type PromptInfo } from "@tui/component/prompt/history"
import { strip } from "@tui/component/prompt/part"

export function DialogMessage(props: {
  messageID: string
  sessionID: string
  setPrompt?: (prompt: PromptInfo) => void
}) {
  const sync = useSync()
  const sdk = useSDK()
  const message = createMemo(() => sync.data.message[props.sessionID]?.find((x) => x.id === props.messageID))
  const route = useRoute()
  const history = usePromptHistory()

  const prompt = (id: string) =>
    (sync.data.part[id] ?? []).reduce(
      (agg, part) => {
        if (part.type === "text" && !part.synthetic) agg.input += part.text
        if (part.type === "file" || part.type === "agent") agg.parts.push(strip(part))
        return agg
      },
      { input: "", parts: [] as PromptInfo["parts"] },
    )

  return (
    <DialogSelect
      title="Message Actions"
      options={[
        {
          title: "Revert",
          value: "session.revert",
          description: "undo messages and file changes",
          onSelect: (dialog) => {
            const msg = message()
            if (!msg) return

            sdk.client.session.revert({
              sessionID: props.sessionID,
              messageID: msg.id,
            })

            if (props.setPrompt) props.setPrompt(prompt(msg.id))

            dialog.clear()
          },
        },
        {
          title: "Copy",
          value: "message.copy",
          description: "message text to clipboard",
          onSelect: async (dialog) => {
            const msg = message()
            if (!msg) return

            const parts = sync.data.part[msg.id]
            const text = parts.reduce((agg, part) => {
              if (part.type === "text" && !part.synthetic) {
                agg += part.text
              }
              return agg
            }, "")

            await Clipboard.copy(text)
            dialog.clear()
          },
        },
        {
          title: "Fork",
          value: "session.fork",
          description: "create a new session",
          onSelect: async (dialog) => {
            const msg = message()
            if (!msg) return

            const result = await sdk.client.session.fork({
              sessionID: props.sessionID,
              messageID: props.messageID,
            })
            const next = result.data?.id
            if (!next) return

            for (const item of sync.data.message[props.sessionID] ?? []) {
              if (item.id === props.messageID) break
              if (item.role !== "user") continue
              const promptInfo = prompt(item.id)
              if (!promptInfo.input && !promptInfo.parts.length) continue
              history.append(promptInfo, next)
            }

            route.navigate({
              sessionID: next,
              type: "session",
              initialPrompt: prompt(msg.id),
            })
            dialog.clear()
          },
        },
      ]}
    />
  )
}
