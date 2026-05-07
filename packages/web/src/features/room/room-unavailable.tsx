import {Link} from "@tanstack/react-router";
import {CenteredPanel} from "../../components/layout";
import {Button, Card, CardContent} from "../../components/ui";

export function RoomUnavailable({message}: {message: string}) {
  return (
    <CenteredPanel className="py-16">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6 text-center">
          <h1 className="text-2xl font-semibold font-display">
            Room unavailable
          </h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          <Link to="/" className="block">
            <Button className="w-full">Back home</Button>
          </Link>
        </CardContent>
      </Card>
    </CenteredPanel>
  );
}
