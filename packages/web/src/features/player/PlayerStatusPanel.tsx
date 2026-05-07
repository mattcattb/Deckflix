import {Eyebrow} from "../../components/common";

type PlayerStatusPanelProps = {
  body: string;
  title: string;
};

export function PlayerStatusPanel({body, title}: PlayerStatusPanelProps) {
  return (
    <div className="max-w-2xl rounded-[2rem] border border-white/10 bg-[#111] px-8 py-10 text-center">
      <Eyebrow className="text-white/45">Controller</Eyebrow>
      <p className="mt-4 text-2xl font-medium font-display text-white">
        {title}
      </p>
      <p className="mt-3 text-sm leading-6 text-white/62">{body}</p>
    </div>
  );
}
