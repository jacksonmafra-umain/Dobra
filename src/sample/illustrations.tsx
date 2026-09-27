// Sample design system illustrations, generated from Figma frames. Layout values are Figma's own.
import { asset } from './assets';

interface SizeProps {
  size?: number;
}

export function MymLogo() {
  return (
    <div
      className="relative shrink-0 overflow-clip"
      style={{
        width: 62.449,
        height: 40,
      }}
      data-name="member_logo_light_default"
    >
      <div className="absolute inset-[12.24%_0] overflow-clip">
        <div className="absolute inset-[1.61%_1.55%_3.23%_0.78%] overflow-clip">
          <div className="absolute inset-[0_0_0_46.02%]">
            <img
              alt=""
              className="absolute block inset-0 max-w-none size-full"
              src={asset("member_logo_group.svg")}
            />
          </div>
          <div className="absolute inset-[25.4%_54.64%_11.03%_0]">
            <img
              alt="My Store"
              className="absolute block inset-0 max-w-none size-full"
              src={asset("member_logo_vector.svg")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ImDeals({ size = 44 }: SizeProps) {
  return (
    <div
      className="relative shrink-0"
      style={{
        width: size,
        height: size,
      }}
      data-name="im_sq_m_deals"
    >
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={asset("ImDeals.svg")} />
    </div>
  );
}

export function ImBag({ size = 44 }: SizeProps) {
  return (
    <div
      className="overflow-clip relative shrink-0"
      style={{
        width: size,
        height: size,
      }}
      data-name="im_sq_m_bag"
    >
      <div className="absolute inset-[8.82%_17.21%_8.82%_16.91%]" data-name="Bag">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={asset("Bag.svg")} />
      </div>
    </div>
  );
}

export function ImReward({ size = 44 }: SizeProps) {
  return (
    <div
      className="relative shrink-0"
      style={{
        width: size,
        height: size,
      }}
      data-name="im_sq_m_reward"
    >
      <div className="absolute contents inset-0" data-name="image">
        <div className="absolute inset-[9.45%_12.57%_15.06%_12.94%]" data-name="Ellipse 73 (Stroke)">
          <img
            alt=""
            className="absolute block inset-0 max-w-none size-full"
            src={asset("Ellipse73Stroke.svg")}
          />
        </div>
        <div className="absolute contents inset-[29.41%_19.85%_0_19.85%]" data-name="Group">
          <div className="absolute inset-[91.18%_19.85%_0_19.85%] mix-blend-multiply" data-name="Shadow">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={asset("Shadow.svg")} />
          </div>
          <div className="absolute inset-[29.41%_24.26%_4.41%_24.26%]" data-name="Combined Shape">
            <img
              alt=""
              className="absolute block inset-0 max-w-none size-full"
              src={asset("CombinedShape.svg")}
            />
          </div>
          <div className="absolute inset-[52.57%_25.74%_4.41%_25.74%]" data-name="Box">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={asset("Box.svg")} />
          </div>
          <div className="absolute inset-[70.96%_41.18%_13.24%_40.07%]" data-name="Mark">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={asset("Mark.svg")} />
          </div>
          <div className="absolute inset-[29.41%_24.26%_34.93%_24.26%]" data-name="Fries">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={asset("Fries.svg")} />
          </div>
        </div>
        <div className="absolute inset-[27.57%_22.43%_2.57%_22.42%]" data-name="Combined Shape">
          <img
            alt=""
            className="absolute block inset-0 max-w-none size-full"
            src={asset("CombinedShape1.svg")}
          />
        </div>
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={asset("Image.svg")} />
      </div>
    </div>
  );
}

export function ImLocalDeals({ size = 133 }: SizeProps) {
  return (
    <div
      className="overflow-clip relative shrink-0"
      style={{
        width: size,
        height: size,
      }}
      data-name="im_sq_m_local_deals_a"
    >
      <div className="absolute contents inset-[19.85%_48.72%_16.57%_4.41%]">
        <div className="absolute inset-[80.88%_55.15%_16.57%_11.76%]">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={asset("Ellipse99.svg")} />
        </div>
        <div
          className="absolute contents inset-[19.85%_48.72%_18.68%_4.41%]"
          style={{
            containerType: "size",
          }}
          data-name="Enabled_Card"
        >
          <div
            className="absolute flex inset-[19.85%_48.72%_18.68%_4.41%] items-center justify-center"
            style={{
              containerType: "size",
            }}
          >
            <div className="-rotate-15 flex-none h-[hypot(30.123cqw,85.7229cqh)] w-[hypot(69.877cqw,-14.2771cqh)]">
              <div className="relative size-full" data-name="Vector">
                <img
                  alt=""
                  className="absolute block inset-0 max-w-none size-full"
                  src={asset("Vector.svg")}
                />
              </div>
            </div>
          </div>
          <div
            className="absolute flex inset-[19.85%_48.72%_18.68%_4.41%] items-center justify-center"
            style={{
              containerType: "size",
            }}
          >
            <div className="-rotate-15 flex-none h-[hypot(30.123cqw,85.7229cqh)] w-[hypot(69.877cqw,-14.2771cqh)]">
              <div className="relative size-full" data-name="Vector (Stroke)">
                <img
                  alt=""
                  className="absolute block inset-0 max-w-none size-full"
                  src={asset("VectorStroke.svg")}
                />
              </div>
            </div>
          </div>
          <div
            className="absolute flex inset-[62.39%_57.49%_29.45%_20.01%] items-center justify-center"
            style={{
              containerType: "size",
            }}
          >
            <div className="-rotate-15 flex-none h-[hypot(2.72817cqw,28.0908cqh)] w-[hypot(97.2718cqw,-71.9092cqh)]">
              <div className="relative size-full" data-name="Vector">
                <img
                  alt=""
                  className="absolute block inset-0 max-w-none size-full"
                  src={asset("Vector1.svg")}
                />
              </div>
            </div>
          </div>
          <div
            className="absolute flex inset-[68.1%_62.74%_25.44%_21.08%] items-center justify-center"
            style={{
              containerType: "size",
            }}
          >
            <div className="-rotate-15 flex-none h-[hypot(3.79443cqw,35.4564cqh)] w-[hypot(96.2056cqw,-64.5436cqh)]">
              <div className="relative size-full" data-name="Vector">
                <img
                  alt=""
                  className="absolute block inset-0 max-w-none size-full"
                  src={asset("Vector2.svg")}
                />
              </div>
            </div>
          </div>
          <div
            className="absolute flex inset-[30.33%_62.74%_43.31%_14.37%] items-center justify-center"
            style={{
              containerType: "size",
            }}
          >
            <div className="-rotate-15 flex-none h-[hypot(25.5112cqw,82.6695cqh)] w-[hypot(74.4888cqw,-17.3305cqh)]">
              <div className="relative size-full" data-name="Illustrations / Products">
                <img
                  alt=""
                  className="absolute block inset-0 max-w-none size-full"
                  src={asset("IllustrationsProducts.svg")}
                />
                <div className="absolute inset-[36.38%_8.1%_2.9%_5.73%]">
                  <img
                    alt=""
                    className="absolute block inset-0 max-w-none size-full"
                    src={asset("Vector3.svg")}
                  />
                </div>
                <div className="absolute inset-[2.97%_3.69%_46.92%_3.77%]">
                  <img
                    alt=""
                    className="absolute block inset-0 max-w-none size-full"
                    src={asset("Group.svg")}
                  />
                </div>
                <div className="absolute inset-[61.94%_34.23%_14.65%_31.86%]">
                  <img
                    alt=""
                    className="absolute block inset-0 max-w-none size-full"
                    src={asset("Group1.svg")}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute inset-[8.82%_4.78%_8.91%_39.22%]" data-name="Location pin with shadows">
        <img
          alt=""
          className="absolute block inset-0 max-w-none size-full"
          src={asset("LocationPinWithShadows.svg")}
        />
      </div>
      <div className="absolute inset-[8.09%_4.04%_13.78%_3.42%]" data-name="Union (Stroke)">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={asset("UnionStroke.svg")} />
      </div>
    </div>
  );
}

